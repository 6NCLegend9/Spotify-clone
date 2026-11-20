package app.haykasa.android;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

@androidx.media3.common.util.UnstableApi
public class NativeAudioProcessorTest {
    private NativeAudioProcessor processor(int rate, int channels, boolean original, double[] bands, boolean mono) throws Exception {
        NativeAudioProcessor value = new NativeAudioProcessor();
        value.setProcessing(original, bands, mono);
        value.configure(new AudioProcessor.AudioFormat(rate, channels, C.ENCODING_PCM_16BIT));
        value.flush();
        return value;
    }
    private byte[] process(NativeAudioProcessor processor, byte[] input) {
        ByteBuffer buffer = ByteBuffer.wrap(input);
        processor.queueInput(buffer); assertFalse(buffer.hasRemaining());
        ByteBuffer output = processor.getOutput();
        byte[] result = new byte[output.remaining()]; output.get(result); return result;
    }
    private byte[] tone(int rate, int channels, double frequency, double amplitude, int frames) {
        ByteBuffer pcm = ByteBuffer.allocate(frames * channels * 2).order(ByteOrder.LITTLE_ENDIAN);
        for (int frame = 0; frame < frames; frame++) {
            short sample = (short)Math.round(Math.sin(2 * Math.PI * frequency * frame / rate) * amplitude * 32767);
            for (int channel = 0; channel < channels; channel++) pcm.putShort(sample);
        }
        return pcm.array();
    }
    private double rms(byte[] pcm, int skipFrames, int channels) {
        ByteBuffer values = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN);
        values.position(skipFrames * channels * 2);
        double sum = 0; int samples = 0;
        while (values.hasRemaining()) { double sample = values.getShort() / 32768.0; sum += sample * sample; samples++; }
        return Math.sqrt(sum / samples);
    }

    @Test public void originalAndFlatPreserveEveryPcmByteIncludingFullScale() throws Exception {
        byte[] input = new byte[8192]; new java.util.Random(41).nextBytes(input);
        for (boolean original : new boolean[]{true, false}) {
            double[] bands = original ? new double[]{12,-12,12,-12,12,-12} : new double[6];
            NativeAudioProcessor value = processor(48000, 2, original, bands, original);
            assertArrayEquals(input, process(value, input));
            assertFalse(value.stats().processingActive());
            assertEquals(1, value.stats().headroomGain(), 0);
            assertEquals(0, value.stats().limitedFrames());
        }
    }

    @Test public void selectedBandHasMeasuredCutAndBoostResponseAfterHeadroom() throws Exception {
        for (double gain : new double[]{-6, 6}) {
            double[] bands = new double[6]; bands[3] = gain;
            NativeAudioProcessor value = processor(48000, 1, false, bands, false);
            byte[] input = tone(48000, 1, 1000, .1, 48000);
            byte[] output = process(value, input);
            double response = 20 * Math.log10(rms(output, 4800, 1) / rms(input, 4800, 1) / value.stats().headroomGain());
            assertEquals("Measured 1 kHz response must match the requested peaking gain", gain, response, .02);
            assertEquals(0, value.stats().limitedFrames());
        }
    }

    @Test public void everyBandHasItsMeasuredCenterResponse() throws Exception {
        for (int band = 0; band < 6; band++) {
            double[] gains = new double[6]; gains[band] = -9;
            NativeAudioProcessor value = processor(48000, 1, false, gains, false);
            byte[] center = tone(48000, 1, NativeAudioProcessor.BAND_FREQUENCIES[band], .1, 48000);
            byte[] output = process(value, center);
            assertEquals(band == 0 || band == 5 ? -4.5 : -9,
                20 * Math.log10(rms(output, 4800, 1) / rms(center, 4800, 1)), .05);
        }
    }

    @Test public void endBandsAreShelvesRatherThanPeakingFilters() throws Exception {
        for (int band : new int[]{0, 5}) {
            double[] gains = new double[6]; gains[band] = -9;
            NativeAudioProcessor value = processor(48000, 1, false, gains, false);
            double frequency = band == 0 ? 10 : 23000;
            byte[] input = tone(48000, 1, frequency, .2, 96000);
            byte[] output = process(value, input);
            assertEquals("Shelf plateau must retain the full requested gain", -9,
                20 * Math.log10(rms(output, 48000, 1) / rms(input, 48000, 1)), .05);
            value.flush();
            input = tone(48000, 1, 1000, .2, 48000);
            output = process(value, input);
            assertEquals("Distant passband must remain flat", 0,
                20 * Math.log10(rms(output, 4800, 1) / rms(input, 4800, 1)), .05);
        }
    }

    @Test public void monoProducesEqualChannelsAndCancelsOppositePhase() throws Exception {
        NativeAudioProcessor value = processor(48000, 2, false, new double[6], true);
        ByteBuffer source = ByteBuffer.allocate(400).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < 100; i++) { source.putShort((short)10000); source.putShort((short)-10000); }
        assertArrayEquals(new byte[400], process(value, source.array()));
        source.clear();
        for (int i = 0; i < 100; i++) { source.putShort((short)10000); source.putShort((short)0); }
        ByteBuffer output = ByteBuffer.wrap(process(value, source.array())).order(ByteOrder.LITTLE_ENDIAN);
        while (output.hasRemaining()) { assertEquals(5000, output.getShort()); assertEquals(5000, output.getShort()); }
    }

    @Test public void processedOutputHasBoundedMeasuredSamplePeaks() throws Exception {
        for (double gain : new double[]{-12, 12}) {
            double[] bands = new double[6]; Arrays.fill(bands, gain);
            NativeAudioProcessor value = processor(48000, 2, false, bands, true);
            byte[] input = new byte[48000 * 4]; new java.util.Random(6).nextBytes(input);
            ByteBuffer output = ByteBuffer.wrap(process(value, input)).order(ByteOrder.LITTLE_ENDIAN);
            while (output.hasRemaining()) assertTrue(Math.abs((int)output.getShort()) <= NativeAudioProcessor.MAX_PROCESSED_SAMPLE);
            assertTrue(Double.isFinite(value.stats().inputSamplePeak()));
            assertTrue(value.stats().outputSamplePeak() <= NativeAudioProcessor.SAMPLE_PEAK_CEILING);
            assertTrue(Double.isFinite(value.stats().headroomGain()));
        }
        NativeAudioProcessor mono = processor(48000, 2, false, new double[6], true);
        byte[] full = new byte[4000]; ByteBuffer samples = ByteBuffer.wrap(full).order(ByteOrder.LITTLE_ENDIAN);
        while (samples.hasRemaining()) samples.putShort(Short.MAX_VALUE);
        process(mono, full);
        assertTrue("The actual limiter must act on full-scale processed samples", mono.stats().limitedFrames() > 0);
        assertEquals(Short.MAX_VALUE / 32768.0, mono.stats().inputSamplePeak(), 0);
        assertEquals(NativeAudioProcessor.SAMPLE_PEAK_CEILING, mono.stats().outputSamplePeak(), 0);
    }

    @Test public void chunkBoundariesKeepTheSameFilterAndLimiterHistory() throws Exception {
        double[] bands = {12, 7, -4, 6, 3, -2};
        byte[] input = tone(48000, 2, 400, .9, 4096);
        byte[] whole = process(processor(48000, 2, false, bands, false), input);
        NativeAudioProcessor chunks = processor(48000, 2, false, bands, false);
        byte[] output = new byte[input.length]; int offset = 0;
        for (int count : new int[]{4, 28, 1024, 320, 12, input.length - 1388}) {
            byte[] part = process(chunks, Arrays.copyOfRange(input, offset, offset + count));
            System.arraycopy(part, 0, output, offset, part.length); offset += count;
        }
        assertEquals(input.length, offset); assertArrayEquals(whole, output);
    }

    @Test public void lowRateCentersStayBelowNyquistAndRemainFinite() throws Exception {
        NativeAudioProcessor value = processor(8000, 6, false, new double[]{12,-12,12,-12,12,-12}, false);
        for (double frequency : value.effectiveBandFrequencies()) assertTrue(frequency < 4000);
        process(value, tone(8000, 6, 3500, .99, 8000));
        assertTrue(Double.isFinite(value.stats().outputSamplePeak())); assertTrue(value.stats().outputSamplePeak() <= NativeAudioProcessor.SAMPLE_PEAK_CEILING);
        assertTrue("Low-rate processing must retain nonzero audio", value.stats().outputSamplePeak() > 0);
        assertEquals(3600, value.effectiveBandFrequencies()[5], 0);
    }

    @Test public void supportedRateExtremesRemainBoundedWithAlternatingExtremeBands() throws Exception {
        for (int rate : new int[]{8000, 44100, 48000, 96000, 192000}) {
            for (int channels : new int[]{1, 2}) {
                NativeAudioProcessor value = processor(rate, channels, false,
                    new double[]{12, -12, 12, -12, 12, -12}, false);
                byte[] input = new byte[rate * channels * 2];
                new java.util.Random(29).nextBytes(input);
                ByteBuffer output = ByteBuffer.wrap(process(value, input)).order(ByteOrder.LITTLE_ENDIAN);
                while (output.hasRemaining()) assertTrue(Math.abs((int)output.getShort()) <= NativeAudioProcessor.MAX_PROCESSED_SAMPLE);
                assertTrue(Double.isFinite(value.stats().headroomGain()));
                assertTrue(value.stats().headroomGain() > 0);
                assertEquals(rate, value.stats().frames());
                assertTrue("Stable filters must retain nonzero audio", value.stats().outputSamplePeak() > 0);
            }
        }
    }

    @Test public void pendingOutputMustBeDrainedBeforeMoreInput() throws Exception {
        NativeAudioProcessor value = processor(48000, 2, false, new double[6], false);
        value.queueInput(ByteBuffer.wrap(new byte[4]));
        ByteBuffer next = ByteBuffer.wrap(new byte[4]);
        assertThrows(IllegalStateException.class, () -> value.queueInput(next));
        assertEquals(0, next.position());
        value.getOutput();
        assertArrayEquals(new byte[4], process(value, new byte[4]));
    }

    @Test public void invalidSettingsAndUnsupportedFormatsAreRejected() throws Exception {
        NativeAudioProcessor value = new NativeAudioProcessor();
        for (double[] bands : new double[][]{new double[5], {0,0,0,0,0,Double.NaN}, {0,0,0,0,0,Double.POSITIVE_INFINITY}, {0,0,0,0,0,13}, {0,0,0,0,0,-13}}) {
            assertThrows(IllegalArgumentException.class, () -> value.setProcessing(false, bands, false));
        }
        assertThrows(IllegalArgumentException.class, () -> value.setProcessing(false, null, false));
        for (AudioProcessor.AudioFormat format : new AudioProcessor.AudioFormat[]{new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_FLOAT), new AudioProcessor.AudioFormat(48000,33,C.ENCODING_PCM_16BIT), new AudioProcessor.AudioFormat(4000,2,C.ENCODING_PCM_16BIT)}) {
            assertThrows(AudioProcessor.UnhandledAudioFormatException.class, () -> value.configure(format));
        }
    }

    @Test public void flushResetsHistoryAndConfigurationCopiesCallerData() throws Exception {
        double[] gains = {0,0,0,-6,0,0};
        NativeAudioProcessor value = processor(48000, 1, false, gains, false); gains[3] = 12;
        byte[] input = tone(48000,1,1000,.1,4800); byte[] first = process(value,input);
        assertEquals(-6,20*Math.log10(rms(first,480,1)/rms(input,480,1)),.05);
        value.flush(); assertArrayEquals(first,process(value,input));
        value.setProcessing(true,new double[6],false); assertArrayEquals(input,process(value,input));
        value.reset(); value.configure(new AudioProcessor.AudioFormat(44100,2,C.ENCODING_PCM_16BIT)); value.flush();
        byte[] stereo=tone(44100,2,1000,.1,4410);assertArrayEquals(stereo,process(value,stereo));
        assertEquals(44100,value.stats().sampleRate());assertEquals(2,value.stats().channelCount());
    }

    @Test public void multichannelBypassPreservesEveryChannelAndFrame() throws Exception {
        for (int channels : new int[]{6, 8, 32}) {
            byte[] input = new byte[4096 * channels * 2]; new java.util.Random(channels).nextBytes(input);
            for (boolean original : new boolean[]{true, false}) {
                NativeAudioProcessor value = processor(48000, channels, original, new double[6], false);
                assertArrayEquals(input, process(value, input));
                assertEquals(channels, value.stats().channelCount());
                assertEquals(4096, value.stats().frames());
            }
        }
    }

    @Test public void multichannelEqPreservesLayoutAndChannelIndependence() throws Exception {
        for (int channels : new int[]{6, 8}) {
            int frames = 4800;
            ByteBuffer input = ByteBuffer.allocate(frames * channels * 2).order(ByteOrder.LITTLE_ENDIAN);
            for (int frame = 0; frame < frames; frame++) {
                for (int channel = 0; channel < channels; channel++) {
                    input.putShort((short)Math.round(Math.sin(2 * Math.PI * 1000 * frame / 48000) * (channel + 1) * 1000));
                }
            }
            NativeAudioProcessor value = processor(48000, channels, false, new double[]{0,0,0,-6,0,0}, false);
            ByteBuffer output = ByteBuffer.wrap(process(value, input.array())).order(ByteOrder.LITTLE_ENDIAN);
            for (int channel = 0; channel < channels; channel++) {
                double sourceEnergy = 0, outputEnergy = 0;
                for (int frame = 480; frame < frames; frame++) {
                    int position = (frame * channels + channel) * 2;
                    double source = input.getShort(position), result = output.getShort(position);
                    sourceEnergy += source * source; outputEnergy += result * result;
                }
                assertEquals(-6, 10 * Math.log10(outputEnergy / sourceEnergy), .02);
            }
            assertEquals(frames * channels * 2, output.remaining());
        }
    }

    @Test public void multichannelMonoAveragesEveryInputAndRepeatsAcrossLayout() throws Exception {
        for (int channels : new int[]{6, 8}) {
            NativeAudioProcessor value = processor(8000, channels, false, new double[6], true);
            ByteBuffer input = ByteBuffer.allocate(100 * channels * 2).order(ByteOrder.LITTLE_ENDIAN);
            for (int frame = 0; frame < 100; frame++) {
                for (int channel = 0; channel < channels; channel++) input.putShort((short)(channel % 2 == 0 ? 10000 : -10000));
            }
            assertArrayEquals(new byte[input.capacity()], process(value, input.array()));
            input.clear();
            for (int frame = 0; frame < 100; frame++) {
                for (int channel = 0; channel < channels; channel++) input.putShort((short)(channel == channels - 1 ? 12000 : 0));
            }
            ByteBuffer output = ByteBuffer.wrap(process(value, input.array())).order(ByteOrder.LITTLE_ENDIAN);
            while (output.hasRemaining()) assertEquals(12000 / channels, output.getShort());
        }
    }

    @Test public void multichannelLimiterUsesOneGainForEveryChannel() throws Exception {
        int channels = 6, frames = 6000;
        NativeAudioProcessor value = processor(48000, channels, false, new double[]{0,0,0,-6,0,0}, false);
        ByteBuffer input = ByteBuffer.allocate(frames * channels * 2).order(ByteOrder.LITTLE_ENDIAN);
        for (int frame = 0; frame < frames; frame++) {
            input.putShort(Short.MAX_VALUE);
            for (int channel = 1; channel < channels; channel++) input.putShort((short)(channel * 1000));
        }
        ByteBuffer output = ByteBuffer.wrap(process(value, input.array())).order(ByteOrder.LITTLE_ENDIAN);
        output.position((frames - 1) * channels * 2);
        int reference = output.getShort();
        for (int channel = 1; channel < channels; channel++) {
            assertEquals(channel * 1000.0 / Short.MAX_VALUE, output.getShort() / (double)reference, .0001);
        }
        assertTrue(value.stats().limitedFrames() > 0);
        assertTrue(value.stats().outputSamplePeak() <= NativeAudioProcessor.SAMPLE_PEAK_CEILING);
    }

    @Test public void replayingIdenticalSettingsPreservesWaveformAndMeasurements() throws Exception {
        double[] bands = {0, 0, 0, -6, 0, 0};
        byte[] input = tone(48000, 2, 137, .999, 4096);
        NativeAudioProcessor uninterrupted = processor(48000, 2, false, bands, true);
        byte[] expected = process(uninterrupted, input);
        assertTrue("The fixture must exercise limiter history", uninterrupted.stats().limitedFrames() > 0);

        NativeAudioProcessor rebound = processor(48000, 2, false, bands, true);
        int split = 1379 * 4;
        byte[] first = process(rebound, Arrays.copyOfRange(input, 0, split));
        rebound.setProcessing(false, bands.clone(), true);
        byte[] second = process(rebound, Arrays.copyOfRange(input, split, input.length));
        byte[] actual = new byte[input.length];
        System.arraycopy(first, 0, actual, 0, first.length);
        System.arraycopy(second, 0, actual, first.length, second.length);
        assertArrayEquals("Rebinding unchanged settings must retain filter and limiter history", expected, actual);
        assertEquals("Measurements must remain cumulative through an identical replay", uninterrupted.stats(), rebound.stats());
    }

    @Test public void rendererResetRetainsRequestedSettingsAcrossPrepare() throws Exception {
        NativeAudioProcessor value = processor(48000, 1, false, new double[]{0,0,0,-6,0,0}, false);
        byte[] input = tone(48000, 1, 1000, .1, 4800);
        byte[] first = process(value, input);
        value.reset();
        assertEquals(0, value.stats().frames());
        value.configure(new AudioProcessor.AudioFormat(48000, 1, C.ENCODING_PCM_16BIT));
        value.flush();
        assertArrayEquals(first, process(value, input));
        assertTrue(value.stats().processingActive());
        assertEquals(-6, 20 * Math.log10(rms(first, 480, 1) / rms(input, 480, 1)), .05);
    }

    @Test public void fragmentedFramesAreRejectedWithoutConsumingInput() throws Exception {
        NativeAudioProcessor value=processor(48000,2,false,new double[6],true);
        ByteBuffer input=ByteBuffer.wrap(new byte[3]);
        assertThrows(IllegalArgumentException.class,()->value.queueInput(input)); assertEquals(0,input.position());
    }
}
