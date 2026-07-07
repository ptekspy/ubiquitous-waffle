export async function readJsonResponse<TSuccess, TError>(response: Response, fallbackError: TError): Promise<TSuccess | TError> {
  try {
    return (await response.json()) as TSuccess | TError;
  } catch {
    return fallbackError;
  }
}
