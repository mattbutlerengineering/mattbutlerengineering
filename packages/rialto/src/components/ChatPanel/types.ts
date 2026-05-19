export interface DomainContextSchema {
  name: string;
  description: string;
  fields: string;
}

export interface DomainContext {
  schemas: DomainContextSchema[];
}
