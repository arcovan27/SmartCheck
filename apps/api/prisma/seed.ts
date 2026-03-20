import { PrismaClient, ChecklistResponseType, UserRole, MaintenancePlanTriggerType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type TemplateSeed = {
  equipmentName: string;
  name: string;
  periodicity: "DIARIO" | "SEMANAL" | "MENSAL";
  items: string[];
};

const checklistTemplates: TemplateSeed[] = [
  {
    equipmentName: "Empilhadeira GLP",
    name: "Checklist Diário de Empilhadeira",
    periodicity: "SEMANAL",
    items: [
      "Nível água/óleo",
      "Pintura geral",
      "Rodas dianteiras/traseiras",
      "Material preso nas rodas",
      "Correntes da torre",
      "Cinto de segurança",
      "Mangueira de óleo hidráulico",
      "Extintor de incêndio",
      "Pedais/Joystick/Comandos",
      "Buzina e farol",
      "Freio e volante",
      "Retrovisores",
      "Giroflex",
      "Alarme de marcha ré",
      "Código de erro no painel",
      "Nível de combustível",
      "Botijão GLP",
      "Luz de freio",
      "Luzes de advertência no painel",
      "Direção",
      "Torre",
      "Pedal de aproximação",
      "Proteções de segurança",
      "EPIs do operador",
      "Engraxe geral"
    ]
  },
  {
    equipmentName: "Misturador Massa de Tubos",
    name: "Checklist Diário Misturador - Massa Tubos",
    periodicity: "DIARIO",
    items: [
      "As comportas estão funcionando corretamente?",
      "Motor elétrico do misturador está funcionando corretamente?",
      "Botões do painel elétrico estão funcionando corretamente?",
      "Sensor da porta do misturador está funcionando corretamente?",
      "Botões de emergência estão funcionando corretamente?",
      "Filtro de cimento em perfeito estado de conservação?",
      "Trava de segurança da porta em perfeito estado?",
      "Ferramentas de limpeza em perfeito estado?",
      "Sistema hidráulico da comporta está funcionando corretamente?",
      "Óleo hidráulico está nivelado?",
      "Mangueiras do sistema hidráulico em perfeito estado?",
      "Mangueiras do ar comprimido em perfeito estado?",
      "Sistema de comando está correspondendo corretamente?",
      "Pás do sistema giratório estão conservadas?",
      "Sistema hidráulico da água em perfeito estado?",
      "Luminária em LED está funcionando corretamente?",
      "Piso, corrimão e escadas em perfeito estado?",
      "Esteiras funcionando e em perfeito estado?"
    ]
  },
  {
    equipmentName: "Prensa Tubos Manual 01",
    name: "Checklist Diário Prensa Tubos Manual (01)",
    periodicity: "DIARIO",
    items: [
      "Trilhos do carrinho em perfeito estado?",
      "Máquina está sendo lubrificada e engraxada periodicamente?",
      "Botões do painel de comando funcionando corretamente?",
      "Botão de emergência funcionando corretamente?",
      "Mesa da forma em bom estado?",
      "Corrente do eixo central em perfeito estado?",
      "Motor elétrico central funcionando corretamente?",
      "Motor e vibrador do carrinho funcionando corretamente?",
      "Cabos de aço em perfeito estado?",
      "Correia da polia em perfeito estado?",
      "Freio do volante engraxado e funcionando corretamente?"
    ]
  },
  {
    equipmentName: "Prensa Tubos Manual 02",
    name: "Checklist Diário Prensa Tubos Manual (02)",
    periodicity: "DIARIO",
    items: [
      "Trilhos do carrinho em perfeito estado?",
      "Máquina está sendo lubrificada e engraxada periodicamente?",
      "Botões do painel de comando funcionando corretamente?",
      "Botão de emergência funcionando corretamente?",
      "Mesa da forma em bom estado?",
      "Corrente do eixo central em perfeito estado?",
      "Motor elétrico central funcionando corretamente?",
      "Motor e vibrador do carrinho funcionando corretamente?",
      "Cabos de aço em perfeito estado?",
      "Correia da polia em perfeito estado?",
      "Freio do volante engraxado e funcionando corretamente?"
    ]
  },
  {
    equipmentName: "Pá Carregadeira",
    name: "Checklist Pá Carregadeira",
    periodicity: "DIARIO",
    items: [
      "Nível de água do motor está correto?",
      "Buzina está funcionando corretamente?",
      "Sistema de partida está funcionando?",
      "Luzes de freio e pisca alerta estão funcionando?",
      "Luzes traseira e dianteira estão funcionando?",
      "Cilindros de elevação e inclinação funcionando corretamente?",
      "Alarme de ré está funcionando?",
      "Manômetro de temperatura e óleo do motor funcionando?",
      "Amperímetro está funcionando?",
      "Retrovisores em perfeito estado?",
      "Motor sem vazamento e funcionando corretamente?",
      "Pneus dianteiros e traseiros em perfeito estado?",
      "Extintor está no prazo de validade?",
      "Mangueiras em perfeito estado de conservação?"
    ]
  },
  {
    equipmentName: "Caminhão Munck",
    name: "Checklist Caminhão Munck",
    periodicity: "DIARIO",
    items: [
      "Verificar vazamentos nas conexões",
      "Verificar condições das mangueiras",
      "Verificar aperto dos parafusos de fixação das sapatas",
      "Verificar vazamento na saída da bomba hidráulica",
      "Abrir lança / verificar empeno / verificar folga",
      "Condições do moitão e trava de segurança do guincho",
      "Condições dos manetes de comando e patolas",
      "Tabela de içamento legível e de fácil acesso",
      "Guindaste com revisões periódicas em dia",
      "Indicador de carga na lança",
      "Treinamento dos operadores em dia",
      "Cabos de aço / anilhas / cintas em perfeito estado",
      "Freios/pneus/lanternas/retrovisores em perfeito estado",
      "EPIs: colete refletor, capacete e cone",
      "Nível de óleo hidráulico / nível de água / alarme de ré",
      "Carroceria/placa/faixas refletivas em bom estado",
      "Lavagem da cabine e parte externa em dia",
      "Engraxe preventivo das partes externas em dia",
      "Validade aferição do tacógrafo",
      "Validade licença das marginais",
      "Validade licença ANTT"
    ]
  }
];

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);

  const adminEmployee = await prisma.employee.upsert({
    where: { registration: "0001" },
    create: {
      name: "Administrador SmartCheck",
      registration: "0001",
      department: "Administração",
      function: "Administrador",
      active: true
    },
    update: {}
  });

  await prisma.user.upsert({
    where: { email: "admin@smartcheck.local" },
    create: {
      email: "admin@smartcheck.local",
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      employeeId: adminEmployee.id
    },
    update: {
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      employeeId: adminEmployee.id
    }
  });

  const operator = await prisma.employee.upsert({
    where: { registration: "1020" },
    create: {
      name: "Thiago Fitipaldi Maia",
      registration: "1020",
      department: "Operação",
      function: "Operador",
      active: true
    },
    update: {}
  });

  const equipmentSeeds = [
    { name: "Empilhadeira GLP", type: "VEICULO", department: "Logística", model: "Hyster", serialNumber: "EMP-001", mileage: 12000, hourmeter: 450 },
    { name: "Misturador Massa de Tubos", type: "MAQUINA", department: "Produção", model: "MT-500", serialNumber: "MIST-001", hourmeter: 980 },
    { name: "Prensa Tubos Manual 01", type: "MAQUINA", department: "Produção", model: "PTM-01", serialNumber: "PRS-001", hourmeter: 2100 },
    { name: "Prensa Tubos Manual 02", type: "MAQUINA", department: "Produção", model: "PTM-02", serialNumber: "PRS-002", hourmeter: 1880 },
    { name: "Pá Carregadeira", type: "VEICULO", department: "Pátio", model: "PC-90", serialNumber: "PA-001", hourmeter: 1450 },
    { name: "Caminhão Munck", type: "VEICULO", department: "Expedição", model: "Munck 12T", serialNumber: "MUN-001", mileage: 85000, hourmeter: 3200 }
  ];

  for (const equipmentSeed of equipmentSeeds) {
    await prisma.equipment.upsert({
      where: { serialNumber: equipmentSeed.serialNumber },
      create: equipmentSeed,
      update: equipmentSeed
    });
  }

  const epis = [
    "Capacete",
    "Óculos de proteção",
    "Luva de raspa",
    "Bota com biqueira",
    "Protetor auricular",
    "Máscara respiratória",
    "Colete refletivo"
  ];

  for (const epiName of epis) {
    await prisma.epi.upsert({
      where: { name: epiName },
      create: { name: epiName },
      update: {}
    });
  }

  for (const templateSeed of checklistTemplates) {
    const equipment = await prisma.equipment.findFirstOrThrow({
      where: { name: templateSeed.equipmentName }
    });

    const existing = await prisma.checklistTemplate.findFirst({
      where: {
        name: templateSeed.name,
        equipmentId: equipment.id
      }
    });

    if (existing) {
      await prisma.checklistTemplateItem.deleteMany({ where: { templateId: existing.id } });
      await prisma.checklistTemplate.update({
        where: { id: existing.id },
        data: {
          periodicity: templateSeed.periodicity,
          items: {
            create: templateSeed.items.map((label, index) => ({
              label,
              position: index,
              responseType: ChecklistResponseType.OK_PROBLEM_NA,
              required: true,
              createsMaintenanceOnProblem: true
            }))
          }
        }
      });
      continue;
    }

    await prisma.checklistTemplate.create({
      data: {
        name: templateSeed.name,
        periodicity: templateSeed.periodicity,
        equipmentId: equipment.id,
        items: {
          create: templateSeed.items.map((label, index) => ({
            label,
            position: index,
            responseType: ChecklistResponseType.OK_PROBLEM_NA,
            required: true,
            createsMaintenanceOnProblem: true
          }))
        }
      }
    });
  }

  const munck = await prisma.equipment.findFirstOrThrow({ where: { name: "Caminhão Munck" } });
  const empilhadeira = await prisma.equipment.findFirstOrThrow({ where: { name: "Empilhadeira GLP" } });

  await prisma.maintenancePlan.upsert({
    where: { id: "cmf0000000000000000000001" },
    create: {
      id: "cmf0000000000000000000001",
      equipmentId: munck.id,
      title: "Preventiva por KM - Munck",
      description: "Troca de filtros e revisão geral",
      triggerType: MaintenancePlanTriggerType.KM,
      threshold: 10000,
      nearThreshold: 9000,
      lastExecutionValue: 76000
    },
    update: {
      equipmentId: munck.id,
      triggerType: MaintenancePlanTriggerType.KM,
      threshold: 10000,
      nearThreshold: 9000,
      lastExecutionValue: 76000
    }
  });

  await prisma.maintenancePlan.upsert({
    where: { id: "cmf0000000000000000000002" },
    create: {
      id: "cmf0000000000000000000002",
      equipmentId: empilhadeira.id,
      title: "Preventiva por dias - Empilhadeira",
      description: "Revisão de segurança",
      triggerType: MaintenancePlanTriggerType.DAYS,
      threshold: 30,
      nearThreshold: 25,
      lastExecutionDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 22)
    },
    update: {
      equipmentId: empilhadeira.id,
      triggerType: MaintenancePlanTriggerType.DAYS,
      threshold: 30,
      nearThreshold: 25,
      lastExecutionDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 22)
    }
  });

  console.log("Seed concluído.");
  console.log("Login admin: admin@smartcheck.local / admin123");
  console.log(`Operador exemplo: ${operator.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
