import type { RequestHandler } from "express";

import { authService } from "./auth.service.js";

const register: RequestHandler = async (request, response) => {
  const user = await authService.register(request.body ?? {});
  response.status(201).json({ data: { user } });
};

const sendOtp: RequestHandler = async (request, response) => {
  const result = await authService.sendOtp(request.body ?? {});
  response.status(200).json({ data: result });
};

const verifyOtp: RequestHandler = async (request, response) => {
  const result = await authService.verifyOtp(request.body ?? {});
  response.status(200).json({ data: result });
};

export const authController = {
  register,
  sendOtp,
  verifyOtp,
};
