import { ValueTransformer } from 'typeorm';

export const numericTransformer: ValueTransformer = {
  to: (value: number | string | null | undefined) => value,
  from: (value: string | number | null) =>
    value === null ? null : Number(value),
};
