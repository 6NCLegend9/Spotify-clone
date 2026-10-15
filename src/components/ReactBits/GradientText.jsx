export default function GradientText({
  children,
  className = "",
  colors = ["#096192", "#ffffff", "#1399c6", "#096192"],
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