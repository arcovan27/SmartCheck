import dayjs from "dayjs";
import {
  MaintenancePlanAlertState,
  MaintenancePlanTriggerType,
  type Equipment,
  type MaintenancePlan
} from "@prisma/client";

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
  const startDate = plan.lastExecutionDate ?? plan.createdAt;
  const currentValue = dayjs().diff(dayjs(startDate), "day");

  if (currentValue >= plan.threshold) {
    return { state: MaintenancePlanAlertState.DUE, currentValue };
  }

  const near = plan.nearThreshold ?? Math.max(plan.threshold - 5, 0);
  if (currentValue >= near) {
    return { state: MaintenancePlanAlertState.NEAR, currentValue };
  }

  return { state: MaintenancePlanAlertState.OK, currentValue };
}

function calculateByCounter(
  plan: MaintenancePlan,
  currentEquipmentValue: number | null
): { state: MaintenancePlanAlertState; currentValue: number } {
  const baseValue = plan.lastExecutionValue ?? 0;
  const currentValue = Math.max((currentEquipmentValue ?? 0) - baseValue, 0);

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
  const nearThreshold =
    plan.nearThreshold ??
    (plan.triggerType === MaintenancePlanTriggerType.DAYS
      ? Math.max(plan.threshold - 5, 0)
      : Math.max(plan.threshold * 0.9, 0));

  const calc =
    plan.triggerType === MaintenancePlanTriggerType.DAYS
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
