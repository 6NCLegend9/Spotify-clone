export default function GradientText({
  children,
  className = "",
  colors = ["#00e6e6", "#ffffff", "#008080", "#00e6e6"],
  animationSpeed = 8,
  showBorder = false,
}) {
  const gradientStyle = {
    backgroundImage: `linear-gradient(to right, ${colors.join(", ")})`,
    animationDuration: `${animationSpeed}s`,
  };

  return (
    <div
      className={`animated-gradient-text ${className}`}
      style={gradientStyle}
    >
      {showBorder && (
        <div
          className="animated-gradient-border"
          style={gradientStyle}
        ></div>
      )}
      <div className="animated-gradient-content">{children}</div>
    </div>
  );
}