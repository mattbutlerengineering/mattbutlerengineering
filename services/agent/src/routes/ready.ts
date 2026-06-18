import type { FastifyPluginAsync } from "fastify";
import { registerReadinessRoutes } from "@mbe/service-bootstrap";
import { prisma } from "../services/database.js";

const auth0Url = process.env.AUTH_AUTHORITY
  ? `${process.env.AUTH_AUTHORITY.replace(/\/$/, "")}/.well-known/jwks.json`
  : undefined;

export const readinessRoutes: FastifyPluginAsync = (fastify, _opts) =>
  registerReadinessRoutes(fastify, { prisma, auth0Url });
