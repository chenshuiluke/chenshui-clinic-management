import {
  Property,
  ManyToOne,
  Entity,
  OneToOne,
  BeforeCreate,
  BeforeUpdate,
  ValidationError,
} from "@mikro-orm/core";
import BaseEntity from "../base.entity";
import Organization from "../central/organization.entity";
import PatientProfile from "./patient_profile.entity";
import DoctorProfile from "./doctor_profile.entity";
@Entity()
export default class OrganizationUser extends BaseEntity {
  @Property()
  email!: string;

  @Property()
  password!: string;

  @Property()
  firstName!: string;

  @Property()
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
