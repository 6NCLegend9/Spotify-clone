export default function GradientText({
  children,
  className = "",
  colors = ["#24aae2", "#ffffff", "#1171ba", "#24aae2"],
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