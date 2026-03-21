import {
  BiometricProvider,
  BiometricStatus,
  ChecklistItemType,
  ChecklistOptionResult,
  ChecklistPeriodicity,
  ConfirmationMethod,
  EpiMovementType,
  EquipmentType,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceType,
  PrismaClient,
  UserRole
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function upsertEmployee(data: {
  name: string;
  registration: string;
  cpf?: string;
  department: string;
  position: string;
  phone?: string;
  email?: string;
  notes?: string;
}) {
  return prisma.employee.upsert({
    where: { registration: data.registration },
    create: {
      ...data,
      isActive: true
    },
    update: {
      ...data,
      isActive: true
    }
  });
}

async function upsertUser(data: {
  email: string;
  password: string;
  role: UserRole;
  employeeId?: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, 10);

  return prisma.user.upsert({
    where: { email: data.email },
    create: {
      email: data.email,
      passwordHash,
      role: data.role,
      employeeId: data.employeeId,
      isActive: true
    },
    update: {
      passwordHash,
      role: data.role,
      employeeId: data.employeeId,
      isActive: true
    }
  });
}

async function main() {
  const admin = await upsertEmployee({
    name: "Administrador SmartCheck",
    registration: "0001",
    department: "Administração",
    position: "Administrador do Sistema",
    phone: "(11) 90000-0001",
    email: "admin@smartcheck.local"
  });

  const manutencao = await upsertEmployee({
    name: "Carla Menezes",
    registration: "1101",
    cpf: "12345678901",
    department: "Manutenção",
    position: "Técnica de Manutenção",
    phone: "(11) 90000-1101",
    email: "carla.menezes@smartcheck.local"
  });

  const operador = await upsertEmployee({
    name: "Thiago Fitipaldi Maia",
    registration: "1020",
    cpf: "98765432100",
    department: "Operação",
    position: "Operador de Empilhadeira",
    phone: "(11) 90000-1020",
    email: "thiago.maia@smartcheck.local"
  });

  const seguranca = await upsertEmployee({
    name: "Juliana Prado",
    registration: "2104",
    cpf: "56789012345",
    department: "Segurança do Trabalho",
    position: "Técnica de Segurança",
    phone: "(11) 90000-2104",
    email: "juliana.prado@smartcheck.local"
  });

  const almoxarife = await upsertEmployee({
    name: "Ronaldo Almeida",
    registration: "3008",
    cpf: "74185296300",
    department: "Almoxarifado",
    position: "Almoxarife",
    phone: "(11) 90000-3008",
    email: "ronaldo.almeida@smartcheck.local"
  });

  const adminUser = await upsertUser({
    email: "admin@smartcheck.local",
    password: "admin123",
    role: UserRole.ADMIN,
    employeeId: admin.id
  });

  const manutencaoUser = await upsertUser({
    email: "manutencao@smartcheck.local",
    password: "smart123",
    role: UserRole.MANUTENCAO,
    employeeId: manutencao.id
  });

  const operadorUser = await upsertUser({
    email: "operador@smartcheck.local",
    password: "smart123",
    role: UserRole.OPERADOR,
    employeeId: operador.id
  });

  const segurancaUser = await upsertUser({
    email: "sst@smartcheck.local",
    password: "smart123",
    role: UserRole.SEGURANCA_DO_TRABALHO,
    employeeId: seguranca.id
  });

  const almoxarifadoUser = await upsertUser({
    email: "almoxarifado@smartcheck.local",
    password: "smart123",
    role: UserRole.ALMOXARIFADO,
    employeeId: almoxarife.id
  });

  const equipments = [
    {
      name: "Empilhadeira GLP",
      type: EquipmentType.VEICULO,
      department: "Logística",
      model: "Hyster 80",
      serialNumber: "EMP-001",
      mileage: 12240,
      hourmeter: 451,
      manufacturer: "Hyster",
      assetTag: "PAT-001",
      notes: "Uso diário em carga e descarga"
    },
    {
      name: "Misturador Massa de Tubos",
      type: EquipmentType.MAQUINA,
      department: "Produção",
      model: "MT-500",
      serialNumber: "MIST-001",
      hourmeter: 980,
      manufacturer: "InovaMix",
      assetTag: "PAT-010",
      notes: "Linha principal de mistura"
    },
    {
      name: "Prensa Tubos Manual 01",
      type: EquipmentType.MAQUINA,
      department: "Produção",
      model: "PTM-01",
      serialNumber: "PRS-001",
      hourmeter: 2100,
      manufacturer: "Prensatec",
      assetTag: "PAT-015"
    },
    {
      name: "Caminhão Munck",
      type: EquipmentType.VEICULO,
      department: "Expedição",
      model: "Munck 12T",
      serialNumber: "MUN-001",
      mileage: 85200,
      hourmeter: 3200,
      manufacturer: "Volkswagen",
      assetTag: "PAT-100"
    }
  ];

  for (const equipmentData of equipments) {
    await prisma.equipment.upsert({
      where: { serialNumber: equipmentData.serialNumber },
      create: equipmentData,
      update: equipmentData
    });
  }

  const epiSeeds = [
    {
      name: "Capacete Classe B",
      description: "Capacete com jugular para área operacional",
      ca: "12345",
      category: "Proteção da cabeça",
      unit: "UN",
      stock: 120,
      minimumStock: 30
    },
    {
      name: "Óculos de Proteção Incolor",
      description: "Lente incolor antiembaçante",
      ca: "22334",
      category: "Proteção ocular",
      unit: "UN",
      stock: 200,
      minimumStock: 50
    },
    {
      name: "Luva de Raspa",
      description: "Luva para manuseio de peças e cabos",
      ca: "33445",
      category: "Proteção das mãos",
      unit: "PAR",
      stock: 160,
      minimumStock: 40
    },
    {
      name: "Bota com Biqueira",
      description: "Bota de segurança com biqueira de composite",
      ca: "44556",
      category: "Proteção dos pés",
      unit: "PAR",
      stock: 90,
      minimumStock: 20
    }
  ];

  for (const epiSeed of epiSeeds) {
    await prisma.epi.upsert({
      where: {
        name_ca: {
          name: epiSeed.name,
          ca: epiSeed.ca
        }
      },
      create: {
        ...epiSeed,
        isActive: true
      },
      update: {
        ...epiSeed,
        isActive: true
      }
    });
  }

  const empilhadeira = await prisma.equipment.findFirstOrThrow({ where: { serialNumber: "EMP-001" } });
  const caminhãoMunck = await prisma.equipment.findFirstOrThrow({ where: { serialNumber: "MUN-001" } });

  const templateEmpilhadeira = await prisma.checklistTemplate.upsert({
    where: {
      id: "cmseed-checklist-empilhadeira"
    },
    create: {
      id: "cmseed-checklist-empilhadeira",
      name: "Checklist Diário da Empilhadeira",
      description: "Checklist operacional pré-turno",
      periodicity: ChecklistPeriodicity.DIARIO,
      equipmentId: empilhadeira.id,
      isActive: true
    },
    update: {
      name: "Checklist Diário da Empilhadeira",
      description: "Checklist operacional pré-turno",
      periodicity: ChecklistPeriodicity.DIARIO,
      equipmentId: empilhadeira.id,
      isActive: true
    }
  });

  await prisma.checklistTemplateItem.deleteMany({ where: { templateId: templateEmpilhadeira.id } });
  await prisma.checklistTemplateItem.createMany({
    data: [
      {
        templateId: templateEmpilhadeira.id,
        label: "Freio e direção em funcionamento",
        instruction: "Testar com a máquina parada antes da saída",
        itemType: ChecklistItemType.OK_PROBLEMA_NA,
        position: 0,
        required: true,
        requiresObservationOnProblem: true,
        allowsPhotoOnProblem: true,
        opensMaintenanceOnProblem: true
      },
      {
        templateId: templateEmpilhadeira.id,
        label: "Buzina e alarme de ré",
        instruction: "Verificar funcionamento completo",
        itemType: ChecklistItemType.SIM_NAO,
        position: 1,
        required: true,
        requiresObservationOnProblem: true,
        allowsPhotoOnProblem: true,
        opensMaintenanceOnProblem: true
      },
      {
        templateId: templateEmpilhadeira.id,
        label: "Horímetro inicial",
        instruction: "Informar valor antes do início do turno",
        itemType: ChecklistItemType.NUMERO,
        position: 2,
        required: true,
        requiresObservationOnProblem: false,
        allowsPhotoOnProblem: false,
        opensMaintenanceOnProblem: false
      },
      {
        templateId: templateEmpilhadeira.id,
        label: "Observações gerais",
        instruction: "Anotar qualquer desvio percebido",
        itemType: ChecklistItemType.TEXTO,
        position: 3,
        required: false,
        requiresObservationOnProblem: false,
        allowsPhotoOnProblem: false,
        opensMaintenanceOnProblem: false
      }
    ]
  });

  const exec = await prisma.checklistExecution.create({
    data: {
      templateId: templateEmpilhadeira.id,
      equipmentId: empilhadeira.id,
      employeeId: operador.id,
      notes: "Execução de demonstração",
      hadProblem: true
    }
  });

  const checklistItems = await prisma.checklistTemplateItem.findMany({
    where: { templateId: templateEmpilhadeira.id },
    orderBy: { position: "asc" }
  });

  await prisma.checklistExecutionItem.createMany({
    data: [
      {
        executionId: exec.id,
        templateItemId: checklistItems[0].id,
        optionResult: ChecklistOptionResult.OK,
        hadProblem: false
      },
      {
        executionId: exec.id,
        templateItemId: checklistItems[1].id,
        booleanResult: false,
        observation: "Alarme de ré intermitente",
        hadProblem: true
      },
      {
        executionId: exec.id,
        templateItemId: checklistItems[2].id,
        numericValue: 451,
        hadProblem: false
      },
      {
        executionId: exec.id,
        templateItemId: checklistItems[3].id,
        textValue: "Necessário ajuste no alarme durante a parada da tarde",
        hadProblem: false
      }
    ]
  });

  await prisma.maintenance.createMany({
    data: [
      {
        equipmentId: empilhadeira.id,
        checklistExecutionId: exec.id,
        type: MaintenanceType.CORRETIVA,
        priority: MaintenancePriority.ALTA,
        status: MaintenanceStatus.ABERTA,
        description: "Falha no alarme de ré da empilhadeira",
        cause: "Intermitência no chicote",
        responsibleId: manutencao.id,
        notes: "Aberta automaticamente via checklist"
      },
      {
        equipmentId: caminhãoMunck.id,
        type: MaintenanceType.PREVENTIVA,
        priority: MaintenancePriority.MEDIA,
        status: MaintenanceStatus.EM_ANDAMENTO,
        description: "Troca de filtros e revisão geral do caminhão Munck",
        responsibleId: manutencao.id,
        notes: "Execução programada"
      }
    ]
  });

  await prisma.maintenancePlan.createMany({
    data: [
      {
        equipmentId: caminhãoMunck.id,
        title: "Preventiva por KM - Caminhão Munck",
        description: "Revisão de transmissão a cada 10.000 km",
        triggerType: "KM",
        threshold: 10000,
        nearThreshold: 9000,
        lastExecutionValue: 76000,
        isActive: true
      },
      {
        equipmentId: empilhadeira.id,
        title: "Preventiva por dias - Empilhadeira",
        description: "Revisão de segurança mensal",
        triggerType: "DAYS",
        threshold: 30,
        nearThreshold: 25,
        lastExecutionDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 22),
        isActive: true
      }
    ]
  });

  const capacete = await prisma.epi.findFirstOrThrow({ where: { name: "Capacete Classe B" } });
  const oculos = await prisma.epi.findFirstOrThrow({ where: { name: "Óculos de Proteção Incolor" } });

  await prisma.epiDelivery.createMany({
    data: [
      {
        employeeId: operador.id,
        epiId: capacete.id,
        movementType: EpiMovementType.ENTREGA,
        quantity: 1,
        date: new Date(),
        responsibleUserId: almoxarifadoUser.id,
        notes: "Entrega inicial",
        confirmationMethod: ConfirmationMethod.BIOMETRIA,
        confirmationBiometricId: "BIO-OP-1020"
      },
      {
        employeeId: operador.id,
        epiId: oculos.id,
        movementType: EpiMovementType.ENTREGA,
        quantity: 1,
        date: new Date(),
        responsibleUserId: almoxarifadoUser.id,
        notes: "Entrega inicial",
        confirmationMethod: ConfirmationMethod.LOGIN
      }
    ]
  });

  await prisma.employeeBiometric.upsert({
    where: { employeeId: operador.id },
    create: {
      employeeId: operador.id,
      biometricExternalId: "BIO-OP-1020",
      provider: BiometricProvider.MOCK,
      status: BiometricStatus.CADASTRADA
    },
    update: {
      biometricExternalId: "BIO-OP-1020",
      provider: BiometricProvider.MOCK,
      status: BiometricStatus.CADASTRADA
    }
  });

  await prisma.employeeBiometric.upsert({
    where: { employeeId: manutencao.id },
    create: {
      employeeId: manutencao.id,
      provider: BiometricProvider.UAREU_4500,
      status: BiometricStatus.PENDENTE
    },
    update: {
      provider: BiometricProvider.UAREU_4500,
      status: BiometricStatus.PENDENTE
    }
  });

  const employeesToLink = [admin, manutencao, operador, seguranca, almoxarife];
  const usersToLink = [adminUser, manutencaoUser, operadorUser, segurancaUser, almoxarifadoUser];

  for (let index = 0; index < employeesToLink.length; index += 1) {
    await prisma.employee.update({
      where: { id: employeesToLink[index].id },
      data: { user: { connect: { id: usersToLink[index].id } } }
    });
  }

  console.log("Seed concluída com sucesso.");
  console.log("Login admin: admin@smartcheck.local / admin123");
  console.log("Usuários de teste:");
  console.log("- manutencao@smartcheck.local / smart123 (MANUTENCAO)");
  console.log("- operador@smartcheck.local / smart123 (OPERADOR)");
  console.log("- sst@smartcheck.local / smart123 (SEGURANCA_DO_TRABALHO)");
  console.log("- almoxarifado@smartcheck.local / smart123 (ALMOXARIFADO)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
