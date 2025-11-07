import { Entity, Property, ManyToOne, Enum } from "@mikro-orm/core";
import BaseEntity from "../base";
import OrganizationUser from "./organization_user";

export enum AppointmentStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  DECLINED = "DECLINED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

@Entity()
export default class Appointment extends BaseEntity {
  @ManyToOne(() => OrganizationUser, { nullable: true, deleteRule: 'set null' })
  patient!: OrganizationUser | null;

  @ManyToOne(() => OrganizationUser, { nullable: true, deleteRule: 'set null' })
  doctor!: OrganizationUser | null;

  @Property({ type: 'timestamptz' })
  appointmentDateTime!: Date;

  @Enum(() => AppointmentStatus)
  status: AppointmentStatus = AppointmentStatus.PENDING;

  @Property({ type: "text", nullable: true })
  notes?: string;
}
