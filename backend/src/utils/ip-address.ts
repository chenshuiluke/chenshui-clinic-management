import { Request } from 'express';

export function getClientIpAddress(req: Request): string {
  // Prioritize x-forwarded-for header (set by proxies/load balancers)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Extract the first IP if there are multiple (comma-separated)
    const ips = typeof forwardedFor === 'string'
      ? forwardedFor.split(',').map(ip => ip.trim())
      : forwardedFor;

    if (Array.isArray(ips) && ips.length > 0 && ips[0]) {
      return normalizeIpAddress(ips[0]);
    }
  }

  // Check Express's built-in IP detection
  if (req.ip) {
    return normalizeIpAddress(req.ip);
  }

  // Fallback if no IP can be determined
  return '127.0.0.1';
}

function normalizeIpAddress(ip: string): string {
  // Normalize loopback addresses to consistent value
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
    return '127.0.0.1';
  }

  // Handle IPv6-mapped IPv4 addresses (::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return ip;
}
