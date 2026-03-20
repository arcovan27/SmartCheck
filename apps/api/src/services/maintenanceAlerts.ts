import dayjs from "dayjs";
import { MaintenancePlanAlertState, MaintenancePlanTriggerType, type MaintenancePlan, type Equipment } from "@prisma/client";

export type MaintenancePlanAlert = {
  planId: string;
  title: string;
  triggerType: MaintenancePlanTriggerType;
  state: MaintenancePlanAlertState;
  currentValue: number;
  threshold: number;
  nearThreshold: number;
};

function calculateByDays(plan: MaintenancePlan): { state: MaintenancePlanAlertState; currentValue: number } {
  const start = plan.lastExecutionDate ? dayjs(plan.lastExecutionDate) : dayjs(plan.createdAt);
  const currentValue = dayjs().diff(start, "day");

  if (currentValue >= plan.threshold) {
    return { state: MaintenancePlanAlertState.DUE, currentValue };
  }

  const near = plan.nearThreshold ?? Math.max(plan.threshold - 5, 0);
  if (currentValue >= near) {
    return { state: MaintenancePlanAlertState.NEAR, currentValue };
  }

  return { state: MaintenancePlanAlertState.OK, currentValue };
}

function calculateByCounter(plan: MaintenancePlan, equipmentValue: number | null): { state: MaintenancePlanAlertState; currentValue: number } {
  const base = plan.lastExecutionValue ?? 0;
  const currentValue = Math.max((equipmentValue ?? 0) - base, 0);

  if (currentValue >= plan.threshold) {
    return { state: MaintenancePlanAlertState.DUE, currentValue };
  }

  const near = plan.nearThreshold ?? Math.max(plan.threshold * 0.9, 0);
  if (currentValue >= near) {
    return { state: MaintenancePlanAlertState.NEAR, currentValue };
  }

  return { state: MaintenancePlanAlertState.OK, currentValue };
}

export function evaluatePlan(plan: MaintenancePlan, equipment: Equipment): MaintenancePlanAlert {
  const nearThreshold = plan.nearThreshold ?? (plan.triggerType === MaintenancePlanTriggerType.DAYS ? Math.max(plan.threshold - 5, 0) : Math.max(plan.threshold * 0.9, 0));
  const byDays = plan.triggerType === MaintenancePlanTriggerType.DAYS;

  const calc = byDays
    ? calculateByDays(plan)
    : calculateByCounter(
        plan,
        plan.triggerType === MaintenancePlanTriggerType.KM ? equipment.mileage : equipment.hourmeter
      );

  return {
    planId: plan.id,
    title: plan.title,
    triggerType: plan.triggerType,
    state: calc.state,
    currentValue: calc.currentValue,
    threshold: plan.threshold,
    nearThreshold
  };
}
