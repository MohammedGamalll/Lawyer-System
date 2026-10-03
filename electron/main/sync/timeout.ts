export const REQUEST_TIMEOUT_MS = 20_000
export const CYCLE_TIMEOUT_MS = 600_000
export const TIMEOUT_MESSAGE = 'انتهت مهلة الاتصال بخادم المزامنة. تحقق من الإنترنت ثم أعد المحاولة.'

export function withTimeout<T>(promise: Promise<T> | PromiseLike<T>, ms = REQUEST_TIMEOUT_MS, message = TIMEOUT_MESSAGE): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}
