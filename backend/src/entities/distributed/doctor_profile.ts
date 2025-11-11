import { Entity, PrimaryKey, Property, ManyToOne, OneToOne } from "@mikro-orm/core";
import BaseEntity from "../base";
import OrganizationUser from "./organization_user";

@Entity()
export default class DoctorProfile extends BaseEntity {
  @Property({ type: 'string' })
  specialization!: string;

  @Property({ type: 'string' })
  licenseNumber!: string;

  @Property({ type: 'string', nullable: true })
  phoneNumber?: string;

  @OneToOne(() => OrganizationUser, { mappedBy: 'doctorProfile' })
  user?: OrganizationUser;
}
