package app.haykasa.android;

import androidx.media3.common.C;
import androidx.media3.common.audio.BaseAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/** PCM16 EQ/mono and measured-source loudness gain, with sample-peak limiting. */
@androidx.media3.common.util.UnstableApi
final class NativeAudioProcessor extends BaseAudioProcessor {
    static final double[] BAND_FREQUENCIES = {60, 150, 400, 1000, 2400, 15000};
    static final int MAX_PROCESSED_SAMPLE = 29204; // Rounded down from -1 dBFS in PCM16.
    static final double SAMPLE_PEAK_CEILING = MAX_PROCESSED_SAMPLE / 32768.0;
    record Stats(int sampleRate, int channelCount, boolean original, boolean processingActive,
                 long frames, long limitedFrames, double inputSamplePeak, double outputSamplePeak,
                 double headroomGain, double normalizationGain) {}
    private record Settings(boolean original, double[] bands, boolean mono, boolean normalizeLoudness, double normalizationGain) {}
    private static final Settings ORIGINAL = new Settings(true, new double[6], false, false, 1);
    private volatile Settings requested = ORIGINAL;
    private volatile Stats stats = new Stats(0, 0, true, false, 0, 0, 0, 0, 1, 1);
    private Settings applied;
    private final double[][] coefficients = new double[6][5];
    private double[][] history = new double[0][];
    private double[] frame = new double[0];
    private boolean active;
    private double headroom = 1, limiterGain = 1, release;
    private long frames, limitedFrames;
    private double inputPeak, outputPeak;

    void setProcessing(boolean original, double[] bands, boolean mono) {
        setProcessing(original, bands, mono, false, null, null);
    }

    void setProcessing(boolean original, double[] bands, boolean mono, boolean normalizeLoudness,
                       Double integratedLufs, Double truePeakDbfs) {
        if (bands == null || bands.length != BAND_FREQUENCIES.length) throw new IllegalArgumentException("Six EQ bands required");
        double[] copy = bands.clone();
        for (double gain : copy) {
            if (!Double.isFinite(gain) || gain < -12 || gain > 12) throw new IllegalArgumentException("EQ gain must be finite and within +/-12 dB");
        }
        double normalizationGain = measuredNormalizationGain(normalizeLoudness, integratedLufs, truePeakDbfs);
        Settings current = requested;
        // A renderer rebind may replay preferences without changing the audio configuration.
        if (current.original() == original && current.mono() == mono && current.normalizationGain() == normalizationGain
            && current.normalizeLoudness() == normalizeLoudness
            && Arrays.equals(current.bands(), copy)) return;
        requested = new Settings(original, copy, mono, normalizeLoudness, normalizationGain);
    }

    void setLoudnessMeasurement(Double integratedLufs, Double truePeakDbfs) {
        Settings current = requested;
        setProcessing(current.original(), current.bands(), current.mono(), current.normalizeLoudness(), integratedLufs, truePeakDbfs);
    }

    static double measuredNormalizationGain(boolean enabled, Double integratedLufs, Double truePeakDbfs) {
        if (integratedLufs == null && truePeakDbfs == null) return 1; // Unmeasured/silent tracks remain unchanged.
        if (integratedLufs == null || truePeakDbfs == null || !Double.isFinite(integratedLufs)
            || integratedLufs <= -70 || integratedLufs > 10 || !Double.isFinite(truePeakDbfs)
            || truePeakDbfs < -100 || truePeakDbfs > 20) throw new IllegalArgumentException("Invalid measured loudness");
        if (!enabled) return 1;
        double gainDb = Math.min(Math.max(-60, Math.min(12, -14 - integratedLufs)), -1 - truePeakDbfs);
        return Math.pow(10, gainDb / 20);
    }

    Stats stats() { return stats; }

    /** Low-rate PCM cannot represent every UI center; report the actual bounded centers. */
    double[] effectiveBandFrequencies() {
        int rate = stats.sampleRate();
        if (rate == 0) return new double[0];
        return Arrays.stream(BAND_FREQUENCIES).map(frequency -> Math.min(frequency, rate * .45)).toArray();
    }

    @Override protected AudioFormat onConfigure(AudioFormat format) throws UnhandledAudioFormatException {
        if (format.encoding != C.ENCODING_PCM_16BIT || format.sampleRate < 8000 || format.sampleRate > 192000
            || format.channelCount < 1 || format.channelCount > 32) throw new UnhandledAudioFormatException(format);
        return format;
    }

    @Override protected void onFlush() {
        applied = null;
        history = new double[Math.max(0, inputAudioFormat.channelCount)][12];
        frame = new double[history.length];
        resetMeasurements();
        stats = new Stats(Math.max(0, inputAudioFormat.sampleRate), Math.max(0, inputAudioFormat.channelCount),
            true, false, 0, 0, 0, 0, 1, 1);
    }

    @Override protected void onReset() {
        // Renderer Stop/reset retains this player's requested settings for its next prepare.
        applied = null;
        history = new double[0][];
        frame = new double[0];
        stats = new Stats(0, 0, true, false, 0, 0, 0, 0, 1, 1);
    }

    @Override public void queueInput(ByteBuffer input) {
        if (!input.hasRemaining()) return;
        int channels = inputAudioFormat.channelCount;
        if (channels < 1 || history.length != channels) throw new IllegalStateException("Configure and flush PCM before input");
        if (input.remaining() % (channels * 2) != 0) throw new IllegalArgumentException("Whole PCM frames required");
        if (hasPendingOutput()) throw new IllegalStateException("Drain the previous PCM output first");
        Settings next = requested;
        if (next != applied) {
            // Toggling normalization without a measurement changes preference, not the waveform.
            if (applied != null && next.original() == applied.original() && next.mono() == applied.mono()
                && next.normalizationGain() == applied.normalizationGain() && Arrays.equals(next.bands(), applied.bands())) applied = next;
            else apply(next);
        }
        ByteBuffer pcm = input.duplicate().order(ByteOrder.LITTLE_ENDIAN);
        ByteBuffer output = replaceOutputBuffer(input.remaining()).order(ByteOrder.LITTLE_ENDIAN);
        if (!active) {
            while (pcm.hasRemaining()) inputPeak = Math.max(inputPeak, Math.abs(pcm.getShort() / 32768.0));
            outputPeak = inputPeak;
            frames += input.remaining() / (channels * 2);
            output.put(input); // Original and neutral playback preserve every PCM byte.
        } else {
            while (pcm.hasRemaining()) {
                double sum = 0;
                for (int channel = 0; channel < channels; channel++) {
                    frame[channel] = pcm.getShort() / 32768.0;
                    inputPeak = Math.max(inputPeak, Math.abs(frame[channel]));
                    sum += frame[channel];
                }
                // Combine every input channel equally; retain the decoder's channel layout.
                double mono = sum / channels, peak = 0;
                for (int channel = 0; channel < channels; channel++) {
                    frame[channel] = filter(applied.mono() ? mono : frame[channel], channel) * headroom * applied.normalizationGain();
                    peak = Math.max(peak, Math.abs(frame[channel]));
                }
                double required = peak > SAMPLE_PEAK_CEILING ? SAMPLE_PEAK_CEILING / peak : 1;
                limiterGain = required < limiterGain ? required : Math.min(required, 1 - (1 - limiterGain) * release);
                if (limiterGain < .999999) limitedFrames++;
                for (int channel = 0; channel < channels; channel++) {
                    int sample = quantize(frame[channel] * limiterGain);
                    output.putShort((short)sample);
                    outputPeak = Math.max(outputPeak, Math.abs(sample / 32768.0));
                }
                frames++;
            }
            input.position(input.limit());
        }
        output.flip();
        stats = new Stats(inputAudioFormat.sampleRate, channels, applied.original(), active,
            frames, limitedFrames, inputPeak, outputPeak, headroom, applied.original() ? 1 : applied.normalizationGain());
    }

    private int quantize(double value) {
        return (int)Math.max(-MAX_PROCESSED_SAMPLE, Math.min(MAX_PROCESSED_SAMPLE, Math.round(value * 32768)));
    }

    private double filter(double value, int channel) {
        double[] state = history[channel];
        for (int band = 0; band < coefficients.length; band++) {
            double[] c = coefficients[band];
            int index = band * 2;
            double next = c[0] * value + state[index];
            state[index] = c[1] * value - c[3] * next + state[index + 1];
            state[index + 1] = c[2] * value - c[4] * next;
            value = next;
        }
        return value;
    }

    private void resetMeasurements() {
        frames = limitedFrames = 0;
        inputPeak = outputPeak = 0;
        headroom = limiterGain = 1;
    }

    private void apply(Settings next) {
        applied = next;
        for (double[] state : history) Arrays.fill(state, 0);
        resetMeasurements(); // Measurements describe this applied configuration, not older processing.
        active = !next.original() && (next.mono() && history.length > 1 || next.normalizationGain() != 1
            || Arrays.stream(next.bands()).anyMatch(gain -> gain != 0));
        release = Math.exp(-1.0 / (.05 * inputAudioFormat.sampleRate));
        for (int band = 0; band < coefficients.length; band++) {
            double[] c = coefficients[band];
            Arrays.fill(c, 0); c[0] = 1;
            double gain = next.original() ? 0 : next.bands()[band];
            if (gain == 0) continue;
            // RBJ shelves (slope=1) at the ends and Q=1 peaking filters match the browser graph.
            double frequency = Math.min(BAND_FREQUENCIES[band], inputAudioFormat.sampleRate * .45);
            double omega = 2 * Math.PI * frequency / inputAudioFormat.sampleRate;
            double a = Math.pow(10, gain / 40), cosine = Math.cos(omega), sine = Math.sin(omega);
            double b0, b1, b2, a0, a1, a2;
            if (band == 0 || band == coefficients.length - 1) {
                double beta = Math.sqrt(2 * a) * sine; // 2*sqrt(A)*alpha, shelf slope=1.
                if (band == 0) {
                    b0 = a * ((a + 1) - (a - 1) * cosine + beta);
                    b1 = 2 * a * ((a - 1) - (a + 1) * cosine);
                    b2 = a * ((a + 1) - (a - 1) * cosine - beta);
                    a0 = (a + 1) + (a - 1) * cosine + beta;
                    a1 = -2 * ((a - 1) + (a + 1) * cosine);
                    a2 = (a + 1) + (a - 1) * cosine - beta;
                } else {
                    b0 = a * ((a + 1) + (a - 1) * cosine + beta);
                    b1 = -2 * a * ((a - 1) + (a + 1) * cosine);
                    b2 = a * ((a + 1) + (a - 1) * cosine - beta);
                    a0 = (a + 1) - (a - 1) * cosine + beta;
                    a1 = 2 * ((a - 1) - (a + 1) * cosine);
                    a2 = (a + 1) - (a - 1) * cosine - beta;
                }
            } else {
                double alpha = sine / 2;
                b0 = 1 + alpha * a; b1 = -2 * cosine; b2 = 1 - alpha * a;
                a0 = 1 + alpha / a; a1 = b1; a2 = 1 - alpha / a;
            }
            c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0;
            c[3] = a1 / a0; c[4] = a2 / a0;
        }
        if (active && Arrays.stream(next.bands()).anyMatch(gain -> gain > 0)) {
            double maxResponse = 1;
            for (int i = 0; i <= 512; i++) {
                double frequency = i == 0 ? 0 : 10 * Math.pow(inputAudioFormat.sampleRate / 20.0, (i - 1) / 511.0);
                double omega = 2 * Math.PI * frequency / inputAudioFormat.sampleRate, response = 1;
                for (double[] c : coefficients) {
                    double nr = c[0] + c[1] * Math.cos(omega) + c[2] * Math.cos(2 * omega);
                    double ni = -c[1] * Math.sin(omega) - c[2] * Math.sin(2 * omega);
                    double dr = 1 + c[3] * Math.cos(omega) + c[4] * Math.cos(2 * omega);
                    double di = -c[3] * Math.sin(omega) - c[4] * Math.sin(2 * omega);
                    response *= Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
                }
                maxResponse = Math.max(maxResponse, response);
            }
            headroom = SAMPLE_PEAK_CEILING / maxResponse;
        }
    }
}
