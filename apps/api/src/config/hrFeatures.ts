export function parseFeatureFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export const hrFeatures = {
  get workScheduleEnabled(): boolean {
    return parseFeatureFlag(process.env.HR_WORK_SCHEDULE_ENABLED);
  }
};
