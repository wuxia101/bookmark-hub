export function json<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export function errorResponse(status: number, message: string, details?: Record<string, unknown>): Response {
  return Response.json(
    {
      error: {
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}
