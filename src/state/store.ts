export interface Store<T> {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(listener: (value: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(patch) {
      value = { ...value, ...patch };
      listeners.forEach((listener) => listener(value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
