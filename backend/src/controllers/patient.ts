import { Request, Response } from 'express';
import BaseController from './base';
import OrganizationUser, { OrganizationUserRole } from '../entities/distributed/organization_user';
import PatientProfile from '../entities/distributed/patient_profile';
import jwtService from '../services/jwt.service';
import { RequestContext } from '@mikro-orm/core';
import { OrgJWTPayload } from '../config/jwt.config';
import { getClientIpAddress } from '../utils/ip-address';
import { PatientRegisterDto, UpdatePatientProfileDto } from '../validators/patient';

class PatientController extends BaseController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        dateOfBirth,
        phoneNumber,
        address,
        emergencyContactName,
        emergencyContactPhone,
        bloodType,
        allergies,
        chronicConditions,
      } = req.body as PatientRegisterDto;

      // Get the organization-specific EntityManager
      const em = RequestContext.getEntityManager();
      if (!em) {
        res.status(500).json({ error: 'Database context not available' });
        return;
      }

      // Check if a user with the provided email already exists
      const existingUser = await em.findOne(OrganizationUser, { email });
      if (existingUser) {
        res.status(409).json({
          error: 'User with this email already exists in the organization',
        });
        return;
      }

      // Hash the password
      const hashedPassword = await jwtService.hashPassword(password);

      // Extract IP address
      const ipAddress = getClientIpAddress(req);

      // Parse dateOfBirth string to Date object
      const dob = new Date(dateOfBirth);

      // Create PatientProfile entity
      const patientProfile = em.create(PatientProfile, {
        dateOfBirth: dob,
        phoneNumber,
        ipAddress,
        ...(address && { address }),
        ...(emergencyContactName && { emergencyContactName }),
        ...(emergencyContactPhone && { emergencyContactPhone }),
        ...(bloodType && { bloodType }),
        ...(allergies && { allergies }),
        ...(chronicConditions && { chronicConditions }),
      });

      // Create OrganizationUser entity with patientProfile
      const organizationUser = em.create(OrganizationUser, {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        patientProfile,
      });

      // Persist both entities
      await em.persistAndFlush([patientProfile, organizationUser]);

      // Generate JWT tokens
      const payload: OrgJWTPayload = {
        userId: organizationUser.id,
        email: organizationUser.email,
        name: `${organizationUser.firstName} ${organizationUser.lastName}`,
        orgName: req.organization!,
        role: OrganizationUserRole.PATIENT,
      };

      const { accessToken, refreshToken } = jwtService.generateTokenPair(payload);

      // Store refresh token on user entity
      organizationUser.refreshToken = refreshToken;
      await em.flush();

      // Return the created user information with tokens
      res.status(201).json({
        accessToken,
        refreshToken,
        user: {
          id: organizationUser.id,
          email: organizationUser.email,
          firstName: organizationUser.firstName,
          lastName: organizationUser.lastName,
          role: 'patient',
        },
      });
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

      if (!user.patientProfile) {
        res.status(403).json({ error: 'User does not have a patient profile' });
        return;
      }

      res.status(200).json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.patientProfile.dateOfBirth,
        phoneNumber: user.patientProfile.phoneNumber,
        address: user.patientProfile.address,
        emergencyContactName: user.patientProfile.emergencyContactName,
        emergencyContactPhone: user.patientProfile.emergencyContactPhone,
        bloodType: user.patientProfile.bloodType,
        allergies: user.patientProfile.allergies,
        chronicConditions: user.patientProfile.chronicConditions,
      });
    } catch (error: any) {
      console.error('Failed to get patient profile:', error);
      res.status(500).json({ error: 'Failed to get patient profile' });
    }
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const {
        firstName,
        lastName,
        dateOfBirth,
        phoneNumber,
        address,
        emergencyContactName,
        emergencyContactPhone,
        bloodType,
        allergies,
        chronicConditions,
      } = req.body as UpdatePatientProfileDto;

      // Get EntityManager
      const em = RequestContext.getEntityManager();
      if (!em) {
        res.status(500).json({ error: 'Database context not available' });
        return;
      }

      // Use the already-loaded user from requirePatient middleware
      const user = req.organizationUser;

      if (!user || !user.patientProfile) {
        res.status(404).json({ error: 'User or patient profile not found' });
        return;
      }

      // Extract IP address
      const ipAddress = getClientIpAddress(req);

      // Update user fields if provided
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;

      // Update patient profile fields if provided
      if (dateOfBirth) user.patientProfile.dateOfBirth = new Date(dateOfBirth);
      if (phoneNumber) user.patientProfile.phoneNumber = phoneNumber;
      if (address !== undefined) user.patientProfile.address = address;
      if (emergencyContactName !== undefined) user.patientProfile.emergencyContactName = emergencyContactName;
      if (emergencyContactPhone !== undefined) user.patientProfile.emergencyContactPhone = emergencyContactPhone;
      if (bloodType !== undefined) user.patientProfile.bloodType = bloodType;
      if (allergies !== undefined) user.patientProfile.allergies = allergies;
      if (chronicConditions !== undefined) user.patientProfile.chronicConditions = chronicConditions;

      user.patientProfile.ipAddress = ipAddress;

      await em.flush();

      res.status(200).json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.patientProfile.dateOfBirth,
        phoneNumber: user.patientProfile.phoneNumber,
        address: user.patientProfile.address,
        emergencyContactName: user.patientProfile.emergencyContactName,
        emergencyContactPhone: user.patientProfile.emergencyContactPhone,
        bloodType: user.patientProfile.bloodType,
        allergies: user.patientProfile.allergies,
        chronicConditions: user.patientProfile.chronicConditions,
      });
    } catch (error: any) {
      console.error('Failed to update patient profile:', error);
      res.status(500).json({ error: 'Failed to update patient profile' });
    }
  }
}

export default new PatientController();
