interface CustomError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
  meta?: Record<string, unknown>;
  validation?: Array<{
    keyword: string;
    instancePath?: string;
    dataPath?: string;
    schemaPath?: string;
    params?: Record<string, unknown>;
    message?: string;
  }>;
  details?: Record<string, unknown>;
}

export interface ErrorClassification {
  status: number;
  title: string;
  detail: string;
  extensions: Record<string, unknown>;
}

export function getTitleForStatus(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 406:
      return "Not Acceptable";
    case 408:
      return "Request Timeout";
    case 409:
      return "Conflict";
    case 410:
      return "Gone";
    case 415:
      return "Unsupported Media Type";
    case 422:
      return "Unprocessable Entity";
    case 429:
      return "Too Many Requests";
    case 503:
      return "Service Unavailable";
    default:
      return "Error";
  }
}

export function classifyError(err: unknown): ErrorClassification {
  const e = err as CustomError;

  const isPrisma =
    e.name === "PrismaClientKnownRequestError" ||
    e.constructor?.name === "PrismaClientKnownRequestError" ||
    (typeof e.code === "string" && e.code.startsWith("P2"));

  if (isPrisma) {
    return classifyPrismaError(e);
  }

  if (e.validation) {
    return classifyValidationError(e);
  }

  if (typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 600) {
    return classifyHttpError(e);
  }

  return {
    status: e.statusCode || e.status || 500,
    title: "Internal Server Error",
    detail: e.message || "An unexpected error occurred",
    extensions: {},
  };
}

function classifyPrismaError(e: CustomError): ErrorClassification {
  const prismaCode = e.code || "";
  const extensions: Record<string, unknown> = { prismaCode };
  if (e.meta) {
    extensions.prismaMeta = e.meta;
  }

  if (prismaCode === "P2025") {
    return {
      status: 404,
      title: "Not Found",
      detail: (e.meta?.cause as string) || e.message || "Record not found",
      extensions,
    };
  }

  if (prismaCode === "P2002") {
    const target = Array.isArray(e.meta?.target) ? e.meta.target.join(", ") : "field";
    return {
      status: 409,
      title: "Conflict",
      detail: `Unique constraint failed: ${target}`,
      extensions,
    };
  }

  if (prismaCode === "P2003") {
    return {
      status: 409,
      title: "Conflict",
      detail: `Foreign key constraint failed on field: ${(e.meta?.field_name as string) || "field"}`,
      extensions,
    };
  }

  return {
    status: 500,
    title: "Database Error",
    detail: "A database error occurred",
    extensions,
  };
}

function classifyValidationError(e: CustomError): ErrorClassification {
  const validationMsgs = (e.validation ?? []).map((v) => {
    const path = v.instancePath || v.dataPath || "";
    const field = path.startsWith("/")
      ? path.slice(1)
      : (v.params?.missingProperty as string) || "";
    const fieldPrefix = field ? `'${field}' ` : "";
    return `${fieldPrefix}${v.message || ""}`;
  });
  return {
    status: 400,
    title: "Bad Request",
    detail: `Validation failed: ${validationMsgs.join(", ")}`,
    extensions: { details: { validation: e.validation } },
  };
}

function classifyHttpError(e: CustomError): ErrorClassification {
  const status = e.statusCode as number;
  const extensions: Record<string, unknown> = {};
  if (e.details) {
    extensions.details = e.details;
  }
  return {
    status,
    title: getTitleForStatus(status),
    detail: e.message,
    extensions,
  };
}
