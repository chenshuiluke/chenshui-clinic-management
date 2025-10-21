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
@Entity()
export default class OrganizationUser extends BaseEntity {
  @Property({ type: 'string' })
  email!: string;

  @Property({ type: 'string' })
  password!: string;

  @Property({ type: 'string' })
  firstName!: string;

  @Property({ type: 'string' })
  lastName!: string;

  @OneToOne({ nullable: true })
  doctorProfile?: DoctorProfile;

  @OneToOne({ nullable: true })
  patientProfile?: PatientProfile;

  @BeforeCreate()
  @BeforeUpdate()
  validateOnlyOneRole() {
    if (this.patientProfile && this.doctorProfile) {
      throw new ValidationError(
        "User cannot have both patient and doctor profiles. Please set only one.",
      );
    }
  }
}
