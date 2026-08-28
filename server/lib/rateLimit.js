export function createRateLimiter({ limit, windowMs }) {
  const requestsByUser = new Map();

  return (req, res, next) => {
    const userId = req.user?._id?.toString();
    if (!userId) return next();

    const now = Date.now();
    const recentRequests = (requestsByUser.get(userId) || []).filter((time) => time > now - windowMs);
    if (recentRequests.length >= limit) return res.status(429).json({ message: "Please slow down and try again shortly" });

    recentRequests.push(now);
    requestsByUser.set(userId, recentRequests);
    return next();
  };
}