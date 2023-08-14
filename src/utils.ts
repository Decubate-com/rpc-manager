// typesafe event raiser
type EvtCallback<T> = (data?: T) => void;
export class Evt<T> {
  private _singleCallback: EvtCallback<T> | null = null;
  private _multiCallback = new Array<EvtCallback<T>>();

  public on = (handler: EvtCallback<T>) => {
    if (this._singleCallback) {
      this._multiCallback = [this._singleCallback, handler];
      this._singleCallback = null;
    } else if (this._multiCallback.length > 0) {
      this._multiCallback.push(handler);
    } else {
      this._singleCallback = handler;
    }
  };

  public off = (handler: EvtCallback<T>) => {
    if (this._multiCallback.length > 0)
      this._multiCallback = this._multiCallback.filter((c) => c !== handler);
    if (this._singleCallback === handler) this._singleCallback = null;
  };

  public trigger = (data?: T) => {
    if (this._singleCallback !== null) {
      this._singleCallback(data);
    } else {
      const len = this._multiCallback.length;
      for (let i = 0; i < len; i++) this._multiCallback[i](data);
    }
  };
}

export function timeout(ms: number) {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      reject(new Error("Timeout"));
    }, ms)
  );
}

export function delay(ms: number) {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      resolve(null);
    }, ms)
  );
}
