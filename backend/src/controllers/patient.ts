import { Request, Response } from 'express';
import BaseController from './base';
import { getClientIpAddress } from '../utils/ip-address';
import { PatientRegisterDto, UpdatePatientProfileDto } from '../validators/patient';
import patientService from '../services/patient.service';

class PatientController extends BaseController {
  async getAllPatients(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getDb(req);
      const query = req.query.q as string | undefined;
      const parsedLimit = parseInt(req.query.limit as string);
      const limit = Math.max(0, isNaN(parsedLimit) ? 10 : parsedLimit);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      // Build where condition
      const whereCondition = (users: any, { isNotNull, or, ilike, and }: any) => {
        const baseCondition = isNotNull(users.patientProfileId);

        if (!query) {
          return baseCondition;
        }

        // Case-insensitive search on firstName, lastName, or email
        const searchPattern = `%${query}%`;
        return and(
          baseCondition,
          or(
            ilike(users.firstName, searchPattern),
            ilike(users.lastName, searchPattern),
            ilike(users.email, searchPattern)
          )
        );
      };

      // Get total count with the same filters
      const totalResult = await db.query.organizationUserTable.findMany({
        where: whereCondition,
        columns: { id: true },
      });
      const total = totalResult.length;

      // Get paginated patients with server-side LIMIT and OFFSET
      const patients = await db.query.organizationUserTable.findMany({
        where: whereCondition,
        with: {
          patientProfile: true,
        },
        limit,
        offset,
      });

      // Map to response shape
      const mappedPatients = patients
        .filter(user => user.patientProfile)
        .map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: 'patient' as const,
          dateOfBirth: user.patientProfile!.dateOfBirth,
          phoneNumber: user.patientProfile!.phoneNumber,
          address: user.patientProfile!.address,
          emergencyContactName: user.patientProfile!.emergencyContactName,
          emergencyContactPhone: user.patientProfile!.emergencyContactPhone,
          bloodType: user.patientProfile!.bloodType,
          allergies: user.patientProfile!.allergies,
          chronicConditions: user.patientProfile!.chronicConditions,
        }));

      res.status(200).json({
        patients: mappedPatients,
        total,
        limit,
        offset,
      });
    } catch (error: any) {
      console.error('Failed to fetch patients:', error);
      res.status(500).json({ error: 'Failed to fetch patients' });
    }
  }

  async register(req: Request, res: Response): Promise<void> {
    try {
      const patientData = req.body as PatientRegisterDto;

      // Get the organization-specific Drizzle database instance
      const db = this.getDb(req);

      // Extract IP address
      const ipAddress = getClientIpAddress(req);

      try {
        const result = await patientService.registerPatient(
          db,
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

      // Get the organization-specific Drizzle database instance
      const db = this.getDb(req);

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
          db,
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
      // Get the organization-specific Drizzle database instance
      const db = this.getDb(req);

      // Use the already-loaded user from requirePatient middleware
      const user = req.organizationUser;

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      try {
        await patientService.deletePatientAccount(
          db,
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
