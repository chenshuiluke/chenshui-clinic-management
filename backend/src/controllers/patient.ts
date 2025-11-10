import { Request, Response } from 'express';
import BaseController from './base';
import { RequestContext } from '@mikro-orm/core';
import { getClientIpAddress } from '../utils/ip-address';
import { PatientRegisterDto, UpdatePatientProfileDto } from '../validators/patient';
import patientService from '../services/patient.service';

class PatientController extends BaseController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const patientData = req.body as PatientRegisterDto;

      // Get the organization-specific EntityManager
      const em = RequestContext.getEntityManager();
      if (!em) {
        res.status(500).json({ error: 'Database context not available' });
        return;
      }

      // Extract IP address
      const ipAddress = getClientIpAddress(req);

      try {
        const result = await patientService.registerPatient(
          em,
          patientData,
          ipAddress,
          req.organization!
        );
        res.status(201).json(result);
      } catch (error: any) {
        if (error.message === 'User with this email already exists in the organization') {
          res.status(409).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to register patient:', error);
      res.status(500).json({ error: 'Failed to register patient' });
    }
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      // Use the already-loaded user from requirePatient middleware
      const user = req.organizationUser;

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      try {
        const profile = await patientService.getPatientProfile(user);
        res.status(200).json(profile);
      } catch (error: any) {
        if (error.message === 'User does not have a patient profile') {
          res.status(403).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to get patient profile:', error);
      res.status(500).json({ error: 'Failed to get patient profile' });
    }
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const updateData = req.body as UpdatePatientProfileDto;

      // Get EntityManager
      const em = RequestContext.getEntityManager();
      if (!em) {
        res.status(500).json({ error: 'Database context not available' });
        return;
      }

      // Use the already-loaded user from requirePatient middleware
      const user = req.organizationUser;

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Extract IP address
      const ipAddress = getClientIpAddress(req);

      try {
        const updatedProfile = await patientService.updatePatientProfile(
          em,
          user,
          updateData,
          ipAddress
        );
        res.status(200).json(updatedProfile);
      } catch (error: any) {
        if (error.message === 'User or patient profile not found') {
          res.status(404).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to update patient profile:', error);
      res.status(500).json({ error: 'Failed to update patient profile' });
    }
  }

  async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      // Get EntityManager
      const em = RequestContext.getEntityManager();
      if (!em) {
        res.status(500).json({ error: 'Database context not available' });
        return;
      }

      // Use the already-loaded user from requirePatient middleware
      const user = req.organizationUser;

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      try {
        await patientService.deletePatientAccount(
          em,
          user,
          req.organization!
        );
        res.status(204).send();
      } catch (error: any) {
        if (error.message === 'User or patient profile not found') {
          res.status(404).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to delete patient account:', error);
      res.status(500).json({ error: 'Failed to delete patient account' });
    }
  }
}

export default new PatientController();
