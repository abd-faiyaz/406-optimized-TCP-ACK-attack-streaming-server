export const isBrowser = (): boolean => {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
};

export const isNode = (): boolean => {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
};