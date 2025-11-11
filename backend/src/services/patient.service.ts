import { EntityManager } from '@mikro-orm/core';
import OrganizationUser from '../entities/distributed/organization_user';
import PatientProfile from '../entities/distributed/patient_profile';
import jwtService from './jwt.service';
import cryptoService from '../utils/crypto';
import { OrgJWTPayload } from '../config/jwt.config';
import { emailService } from './email.service';

class PatientService {
  async registerPatient(em: EntityManager, patientData: any, ipAddress: string, organizationName: string) {
    // Check if a user with the provided email already exists
    const existingUser = await em.findOne(OrganizationUser, { email: patientData.email });
    if (existingUser) {
      throw new Error('User with this email already exists in the organization');
    }

    // Hash the password
    const hashedPassword = await jwtService.hashPassword(patientData.password);

    // Parse dateOfBirth string to Date object
    const dob = new Date(patientData.dateOfBirth);

    // Create PatientProfile entity
    const patientProfile = em.create(PatientProfile, {
      dateOfBirth: dob,
      phoneNumber: patientData.phoneNumber,
      ipAddress,
      ...(patientData.address && { address: patientData.address }),
      ...(patientData.emergencyContactName && { emergencyContactName: patientData.emergencyContactName }),
      ...(patientData.emergencyContactPhone && { emergencyContactPhone: patientData.emergencyContactPhone }),
      ...(patientData.bloodType && { bloodType: patientData.bloodType }),
      ...(patientData.allergies && { allergies: patientData.allergies }),
      ...(patientData.chronicConditions && { chronicConditions: patientData.chronicConditions }),
    });

    // Create OrganizationUser entity with patientProfile
    const organizationUser = em.create(OrganizationUser, {
      email: patientData.email,
      password: hashedPassword,
      firstName: patientData.firstName,
      lastName: patientData.lastName,
      patientProfile,
    });

    // Persist both entities
    await em.persistAndFlush([patientProfile, organizationUser]);

    // Generate JWT tokens
    const payload: OrgJWTPayload = {
      userId: organizationUser.id,
      email: organizationUser.email,
      name: `${organizationUser.firstName} ${organizationUser.lastName}`,
      type: 'org',
      orgName: organizationName
    };

    const { accessToken, refreshToken, refreshTokenPlain } = jwtService.generateTokenPair(payload);

    // Store hashed refresh token on user entity
    organizationUser.refreshToken = await cryptoService.hashRefreshToken(refreshTokenPlain);
    await em.flush();

    // Send welcome email (don't block on failure)
    try {
      await emailService.sendPatientRegistrationEmail({
        to: organizationUser.email,
        patientName: `${organizationUser.firstName} ${organizationUser.lastName}`,
        organizationName,
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Continue with response even if email fails
    }

    // Return the created user information with tokens
    return {
      accessToken,
      refreshToken,
      user: {
        id: organizationUser.id,
        email: organizationUser.email,
        firstName: organizationUser.firstName,
        lastName: organizationUser.lastName,
        role: 'patient',
      },
    };
  }

  async getPatientProfile(user: OrganizationUser) {
    if (!user.patientProfile) {
      throw new Error('User does not have a patient profile');
    }

    return {
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
    };
  }

  async updatePatientProfile(em: EntityManager, user: OrganizationUser, updateData: any, ipAddress: string) {
    if (!user.patientProfile) {
      throw new Error('User or patient profile not found');
    }

    // Update user fields if provided
    if (updateData.firstName) user.firstName = updateData.firstName;
    if (updateData.lastName) user.lastName = updateData.lastName;

    // Update patient profile fields if provided
    if (updateData.dateOfBirth) user.patientProfile.dateOfBirth = new Date(updateData.dateOfBirth);
    if (updateData.phoneNumber) user.patientProfile.phoneNumber = updateData.phoneNumber;
    if (updateData.address !== undefined) user.patientProfile.address = updateData.address;
    if (updateData.emergencyContactName !== undefined) user.patientProfile.emergencyContactName = updateData.emergencyContactName;
    if (updateData.emergencyContactPhone !== undefined) user.patientProfile.emergencyContactPhone = updateData.emergencyContactPhone;
    if (updateData.bloodType !== undefined) user.patientProfile.bloodType = updateData.bloodType;
    if (updateData.allergies !== undefined) user.patientProfile.allergies = updateData.allergies;
    if (updateData.chronicConditions !== undefined) user.patientProfile.chronicConditions = updateData.chronicConditions;

    user.patientProfile.ipAddress = ipAddress;

    await em.flush();

    return this.getPatientProfile(user);
  }

  async deletePatientAccount(em: EntityManager, user: OrganizationUser, organizationName: string) {
    if (!user.patientProfile) {
      throw new Error('User or patient profile not found');
    }

    // Load the user with patientProfile to ensure we have the full entity
    await em.populate(user, ['patientProfile']);

    // Clear the refresh token before deletion
    user.refreshToken = null;
    await em.flush();

    // Use transaction to delete both user and profile
    await em.transactional(async (transactionalEm) => {
      // Remove the patient profile first
      if (user.patientProfile) {
        transactionalEm.remove(user.patientProfile);
      }

      // Remove the user
      transactionalEm.remove(user);

      await transactionalEm.flush();
    });

    // Send deletion confirmation email (don't block on failure)
    try {
      await emailService.sendPatientDeletionEmail({
        to: user.email,
        patientName: `${user.firstName} ${user.lastName}`,
        organizationName,
      });
    } catch (emailError) {
      console.error('Failed to send deletion confirmation email:', emailError);
      // Continue even if email fails
    }
  }
}

export default new PatientService();