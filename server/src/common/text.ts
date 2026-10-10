export const MAX_CODE = 1024 * 1024;
export const isTraceback = (s: string) =>
  /^Traceback \(most recent call last\)/m.test(s);
