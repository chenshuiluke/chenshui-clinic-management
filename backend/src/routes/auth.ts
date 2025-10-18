import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validator';
import { authenticate } from '../middleware/auth.middleware';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema
} from '../validators/auth.validator';

const router = Router();

router.post('/login', validateRequest(loginSchema), (req, res) =>
  authController.login(req, res));

router.post('/register', validateRequest(registerSchema), (req, res) =>
  authController.register(req, res));

router.post('/refresh', validateRequest(refreshTokenSchema), (req, res) =>
  authController.refreshToken(req, res));

router.get('/me', authenticate, (req, res) =>
  authController.me(req, res));

router.post('/logout', authenticate, (req, res) =>
  authController.logout(req, res));

export default router;
