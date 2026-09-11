import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, RequestHandler } from "express";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "REQUEST_ERROR",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route ${request.method} ${request.originalUrl} was not found`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (error instanceof ApiError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }



  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      response.status(409).json({
        error: {
          code: "CONFLICT",
          message: "A record with those details already exists",
        },
      });
      return;
    }
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("LIMIT_")
  ) {
    response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: {
        code: "FILE_UPLOAD_LIMIT_EXCEEDED",
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Uploaded file exceeds the configured limit for this route"
            : "File upload exceeds the allowed field or file limits",
      },
    });
    return;
  }

  if (error instanceof SyntaxError) {
    response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "The request body contains invalid JSON",
      },
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
