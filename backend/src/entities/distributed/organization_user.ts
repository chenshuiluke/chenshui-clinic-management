import {
  Property,
  ManyToOne,
  Entity,
  OneToOne,
  BeforeCreate,
  BeforeUpdate,
  ValidationError,
} from "@mikro-orm/core";
import BaseEntity from "../base";
import Organization from "../central/organization";
import PatientProfile from "./patient_profile";
import DoctorProfile from "./doctor_profile";
import AdminProfile from "./admin_profile";

export enum OrganizationUserRole {
  ADMIN = "ADMIN",
  DOCTOR = "DOCTOR",
  PATIENT = "PATIENT",
}

@Entity()
export default class OrganizationUser extends BaseEntity {
  @Property({ type: "string" })
  email!: string;

  @Property({ type: "string" })
  password!: string;

  @Property({ type: "string" })
  firstName!: string;

  @Property({ type: "string" })
  lastName!: string;

  @OneToOne({ nullable: true, type: DoctorProfile })
  doctorProfile?: DoctorProfile;

  @OneToOne({ nullable: true, type: PatientProfile })
  patientProfile?: PatientProfile;

  @OneToOne({ nullable: true, type: AdminProfile })
  adminProfile?: AdminProfile;

  @BeforeCreate()
  @BeforeUpdate()
  validateOnlyOneRole() {
    const profileCount = [
      this.patientProfile,
      this.doctorProfile,
      this.adminProfile,
    ].filter((profile) => profile !== undefined && profile !== null).length;

    if (profileCount !== 1) {
      throw new ValidationError(
        "User must have exactly one profile (admin, doctor, or patient).",
      );
    }
  }

  getRole(): OrganizationUserRole {
    if (this.adminProfile) {
      return OrganizationUserRole.ADMIN;
    }
    if (this.doctorProfile) {
      return OrganizationUserRole.DOCTOR;
    }
    if (this.patientProfile) {
      return OrganizationUserRole.PATIENT;
    }
    throw new Error("User must have exactly one profile (admin, doctor, or patient).");
  }
}
