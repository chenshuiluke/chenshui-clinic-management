import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import BaseEntity from "../base.entity";

@Entity()
export default class Appointment extends BaseEntity {}
