import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import BaseEntity from "../base";

@Entity()
export default class Appointment extends BaseEntity {}
