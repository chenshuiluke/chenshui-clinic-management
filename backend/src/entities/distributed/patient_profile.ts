import { Entity, PrimaryKey, Property, ManyToOne, OneToOne } from "@mikro-orm/core";
import BaseEntity from "../base";
import OrganizationUser from "./organization_user";

@Entity()
export default class PatientProfile extends BaseEntity {
  @Property({ type: 'datetime' })
  dateOfBirth!: Date;

  @Property({ type: 'string' })
  phoneNumber!: string;

  @Property({ type: 'string', nullable: true })
  address?: string;

  @Property({ type: 'string', nullable: true })
  emergencyContactName?: string;

  @Property({ type: 'string', nullable: true })
  emergencyContactPhone?: string;

  @Property({ type: 'string', nullable: true })
  bloodType?: string;

  @Property({ type: 'string', nullable: true })
  allergies?: string;

  @Property({ type: 'string', nullable: true })
  chronicConditions?: string;

  @Property({ type: 'string' })
  ipAddress!: string;

  @OneToOne(() => OrganizationUser, { mappedBy: 'patientProfile' })
  user?: OrganizationUser;
}
