import {
  BiometricProvider,
  BiometricStatus,
  ChecklistOptionResult,
  ChecklistPeriodicity,
  ChecklistTemplateCode,
  ConfirmationMethod,
  EpiMovementType,
  EquipmentType,
  MaintenancePlanTriggerType,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceType,
  PrismaClient,
  UserRole
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type ChecklistItemSeed = {
  label: string;
  section?: string;
  instruction?: string;
};

async function upsertEmployee(data: {
  name: string;
  registration: string;
  cpf?: string;
  department: string;
  position: string;
  phone?: string;
  email?: string;
  notes?: string;
  admissionDate?: Date;
}) {
  return prisma.employee.upsert({
    where: { registration: data.registration },
    create: { ...data, isActive: true },
    update: { ...data, isActive: true }
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

async function upsertTemplateForEquipment(input: {
  equipmentId: string;
  code: ChecklistTemplateCode;
  name: string;
  description?: string;
  periodicity: ChecklistPeriodicity;
  items: ChecklistItemSeed[];
}) {
  const existing = await prisma.checklistTemplate.findFirst({
    where: { equipmentId: input.equipmentId, code: input.code }
  });

  const template = existing
    ? await prisma.checklistTemplate.update({
        where: { id: existing.id },
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          periodicity: input.periodicity,
          equipmentId: input.equipmentId,
          isActive: true
        }
      })
    : await prisma.checklistTemplate.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          periodicity: input.periodicity,
          equipmentId: input.equipmentId,
          isActive: true
        }
      });

  await prisma.checklistTemplateItem.deleteMany({ where: { templateId: template.id } });
  await prisma.checklistTemplateItem.createMany({
    data: input.items.map((item, index) => ({
      templateId: template.id,
      label: item.label,
      section: item.section,
      instruction: item.instruction,
      itemType: "OK_PROBLEMA_NA",
      position: index,
      required: true,
      requiresObservationOnProblem: true,
      allowsPhotoOnProblem: true,
      requiresPhotoOnProblem: false,
      opensMaintenanceOnProblem: true
    }))
  });

  return prisma.checklistTemplate.findUniqueOrThrow({
    where: { id: template.id },
    include: { items: { orderBy: { position: "asc" } } }
  });
}

async function main() {
  await prisma.attachment.deleteMany();
  await prisma.maintenance.deleteMany();
  await prisma.checklistExecutionItem.deleteMany();
  await prisma.checklistExecution.deleteMany();
  await prisma.maintenancePlan.deleteMany();
  await prisma.checklistTemplateItem.deleteMany();
  await prisma.checklistTemplate.deleteMany();
  await prisma.epiDelivery.deleteMany();

  const admin = await upsertEmployee({
    name: "Administrador SmartCheck",
    registration: "0001",
    department: "Administração",
    position: "Administrador do Sistema",
    phone: "(11) 90000-0001",
    email: "admin@smartcheck.local",
    admissionDate: new Date("2022-01-10")
  });

  const manutencao = await upsertEmployee({
    name: "Carla Menezes",
    registration: "1101",
    cpf: "12345678901",
    department: "Manutenção",
    position: "Técnica de Manutenção",
    phone: "(11) 90000-1101",
    email: "carla.menezes@smartcheck.local",
    admissionDate: new Date("2021-05-06")
  });

  const operadorEmpilhadeira = await upsertEmployee({
    name: "Thiago Fitipaldi Maia",
    registration: "1020",
    cpf: "98765432100",
    department: "Logística",
    position: "Operador de Empilhadeira",
    phone: "(11) 90000-1020",
    email: "thiago.maia@smartcheck.local",
    admissionDate: new Date("2023-03-12")
  });

  const operadorProducao = await upsertEmployee({
    name: "Leandro Souza",
    registration: "1041",
    cpf: "11223344556",
    department: "Produção",
    position: "Operador de Máquinas",
    phone: "(11) 90000-1041",
    email: "leandro.souza@smartcheck.local",
    admissionDate: new Date("2020-09-02")
  });

  const seguranca = await upsertEmployee({
    name: "Juliana Prado",
    registration: "2104",
    cpf: "56789012345",
    department: "Segurança do Trabalho",
    position: "Técnica de Segurança",
    phone: "(11) 90000-2104",
    email: "juliana.prado@smartcheck.local",
    admissionDate: new Date("2019-11-01")
  });

  const almoxarife = await upsertEmployee({
    name: "Ronaldo Almeida",
    registration: "3008",
    cpf: "74185296300",
    department: "Almoxarifado",
    position: "Almoxarife",
    phone: "(11) 90000-3008",
    email: "ronaldo.almeida@smartcheck.local",
    admissionDate: new Date("2022-07-20")
  });

  const adminUser = await upsertUser({
    email: "admin@smartcheck.local",
    password: "admin123",
    role: UserRole.ADMIN,
    employeeId: admin.id
  });

  await upsertUser({
    email: "manutencao@smartcheck.local",
    password: "smart123",
    role: UserRole.MANUTENCAO,
    employeeId: manutencao.id
  });

  await upsertUser({
    email: "operador@smartcheck.local",
    password: "smart123",
    role: UserRole.OPERADOR,
    employeeId: operadorEmpilhadeira.id
  });

  await upsertUser({
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

  await prisma.employee.update({ where: { id: admin.id }, data: { user: { connect: { id: adminUser.id } } } });

  const equipments = [
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
      name: "Prensa Tubos Manual 02",
      type: EquipmentType.MAQUINA,
      department: "Produção",
      model: "PTM-02",
      serialNumber: "PRS-002",
      hourmeter: 1790,
      manufacturer: "Prensatec",
      assetTag: "PAT-016"
    },
    {
      name: "Misturador - Massa de Tubos",
      type: EquipmentType.MAQUINA,
      department: "Produção",
      model: "MT-500",
      serialNumber: "MIST-001",
      hourmeter: 980,
      manufacturer: "InovaMix",
      assetTag: "PAT-010"
    },
    {
      name: "Pá Carregadeira",
      type: EquipmentType.VEICULO,
      department: "Pátio",
      model: "WA200",
      serialNumber: "PA-001",
      hourmeter: 1280,
      manufacturer: "Komatsu",
      assetTag: "PAT-030"
    },
    {
      name: "Empilhadeira GLP 01",
      type: EquipmentType.VEICULO,
      department: "Logística",
      model: "Hyster 80",
      serialNumber: "EMP-001",
      hourmeter: 451,
      mileage: 12240,
      manufacturer: "Hyster",
      assetTag: "PAT-001"
    }
  ];

  for (const equipmentData of equipments) {
    await prisma.equipment.upsert({
      where: { serialNumber: equipmentData.serialNumber },
      create: equipmentData,
      update: equipmentData
    });
  }

  const prensa01 = await prisma.equipment.findFirstOrThrow({ where: { serialNumber: "PRS-001" } });
  const prensa02 = await prisma.equipment.findFirstOrThrow({ where: { serialNumber: "PRS-002" } });
  const misturador = await prisma.equipment.findFirstOrThrow({ where: { serialNumber: "MIST-001" } });
  const paCarregadeira = await prisma.equipment.findFirstOrThrow({ where: { serialNumber: "PA-001" } });
  const empilhadeira = await prisma.equipment.findFirstOrThrow({ where: { serialNumber: "EMP-001" } });

  const commonPrensaItems: ChecklistItemSeed[] = [
    { label: "Os trilhos do carrinho estão em perfeito estado de conservação?" },
    { label: "Todos os botões do painel de comando estão funcionando corretamente?" },
    { label: "O botão de emergência está funcionando corretamente?" },
    { label: "A mesa da forma está em bom estado de conservação?" },
    { label: "A corrente do eixo central está em perfeito estado de conservação?" },
    { label: "O motor elétrico central está funcionando corretamente?" },
    { label: "O motor e vibrador do carrinho estão funcionando corretamente?" },
    { label: "Os cabos de aço estão em perfeito estado de conservação?" },
    { label: "A correia da polia está em perfeito estado de conservação?" },
    { label: "O freio do volante está engraxado e funcionando corretamente?" },
    { label: "A máquina está sendo lubrificada e engraxada periodicamente?" }
  ];

  const templatePrensa01 = await upsertTemplateForEquipment({
    equipmentId: prensa01.id,
    code: ChecklistTemplateCode.PRENSA_TUBOS_MANUAL_01,
    name: "Checklist Diário Prensa Tubos Manual (01)",
    periodicity: ChecklistPeriodicity.DIARIO,
    description: "Formulário operacional fiel ao checklist físico da Prensa Tubos Manual 01.",
    items: commonPrensaItems
  });

  await upsertTemplateForEquipment({
    equipmentId: prensa02.id,
    code: ChecklistTemplateCode.PRENSA_TUBOS_MANUAL_02,
    name: "Checklist Diário Prensa Tubos Manual (02)",
    periodicity: ChecklistPeriodicity.DIARIO,
    description: "Formulário operacional fiel ao checklist físico da Prensa Tubos Manual 02.",
    items: commonPrensaItems
  });

  await upsertTemplateForEquipment({
    equipmentId: misturador.id,
    code: ChecklistTemplateCode.MISTURADOR_MASSA_TUBOS,
    name: "Checklist Diário Misturador - Massa Tubos",
    periodicity: ChecklistPeriodicity.DIARIO,
    description: "Formulário operacional fiel ao checklist físico do Misturador de Massa de Tubos.",
    items: [
      { label: "As comportas estão funcionando corretamente?" },
      { label: "O motor elétrico do misturador está funcionando corretamente?" },
      { label: "Os botões de comando do painel elétrico estão funcionando corretamente?" },
      { label: "O sensor da porta do misturador está funcionando corretamente?" },
      { label: "Os botões de emergência estão funcionando corretamente?" },
      { label: "O filtro de cimento está em perfeito estado de conservação?" },
      { label: "A trava de segurança da porta do misturador está em perfeito estado de conservação?" },
      { label: "As ferramentas de limpeza estão em perfeito estado de conservação?" },
      { label: "O sistema hidráulico da comporta está funcionando corretamente?" },
      { label: "O óleo hidráulico está nivelado?" },
      { label: "As mangueiras do sistema hidráulico estão em perfeito estado de conservação?" },
      { label: "As mangueiras do ar comprimido estão em perfeito estado de conservação?" },
      { label: "O sistema de comando está correspondendo corretamente?" },
      { label: "As pás do sistema giratório estão conservadas?" },
      { label: "O sistema hidráulico da água está em perfeito estado de conservação?" },
      { label: "A luminária em LED está funcionando corretamente?" },
      { label: "O piso, corrimão e escadas da plataforma estão em perfeito estado de conservação?" },
      { label: "As esteiras estão funcionando e em perfeito estado de conservação?" }
    ]
  });

  await upsertTemplateForEquipment({
    equipmentId: paCarregadeira.id,
    code: ChecklistTemplateCode.PA_CARREGADEIRA,
    name: "Checklist Pá Carregadeira",
    periodicity: ChecklistPeriodicity.DIARIO,
    description: "Checklist operacional diário da Pá Carregadeira com itens reais do formulário.",
    items: [
      { section: "Sistema Elétrico", label: "Buzina está funcionando corretamente?" },
      { section: "Sistema Elétrico", label: "O sistema de partida está funcionando?" },
      { section: "Sistema Elétrico", label: "As luzes de freio e pisca alerta estão funcionando?" },
      { section: "Sistema Elétrico", label: "As luzes traseira e dianteira estão funcionando?" },
      { section: "Painel", label: "Alarme de ré está funcionando?" },
      { section: "Painel", label: "Manômetros de temperatura e óleo do motor estão funcionando?" },
      { section: "Painel", label: "O amperímetro está funcionando?" },
      { section: "Painel", label: "A buzina está funcionando?" },
      { section: "Motor", label: "O nível de água do motor está correto?" },
      { section: "Motor", label: "O motor está funcionando corretamente? Sem vazamento?" },
      { section: "Outros", label: "Os retrovisores estão em perfeito estado?" },
      { section: "Sistema Hidráulico", label: "Cilindros de elevação e inclinação estão funcionando corretamente?" },
      { section: "Sistema Hidráulico", label: "Mangueiras estão em perfeito estado de conservação?" },
      { section: "Pneus", label: "Os pneus dianteiros e traseiros estão em perfeito estado?" },
      { section: "Outros", label: "O extintor está no prazo de validade?" }
    ]
  });

  const templateEmpilhadeira = await upsertTemplateForEquipment({
    equipmentId: empilhadeira.id,
    code: ChecklistTemplateCode.EMPILHADEIRA_SEMANAL,
    name: "Checklist Empilhadeira Semanal 2024",
    periodicity: ChecklistPeriodicity.SEMANAL,
    description: "Checklist operacional de empilhadeira com verificação visual e com equipamento ligado.",
    items: [
      { section: "Verificação visual / equipamento desligado", label: "Nível água/óleo (agachar e olhar por baixo da máquina)." },
      { section: "Verificação visual / equipamento desligado", label: "Pintura geral (dar uma volta completa na máquina)." },
      { section: "Verificação visual / equipamento desligado", label: "Rodas dianteiras/traseiras (porcas soltas ou material alojado)." },
      { section: "Verificação visual / equipamento desligado", label: "Material preso nas rodas (observar lado interno e retirar)." },
      { section: "Verificação visual / equipamento desligado", label: "Correntes da torre (verificação visual)." },
      { section: "Verificação visual / equipamento desligado", label: "Cinto de segurança (presença e condições de uso)." },
      { section: "Verificação visual / equipamento desligado", label: "Mangueira de óleo hidráulico (existência de defeitos)." },
      { section: "Verificação visual / equipamento desligado", label: "Extintor de incêndio (presença, conservação, lacre e validade)." },
      { section: "Verificação visual / equipamento desligado", label: "EPIs do operador (bota, capacete, óculos, uniforme)." },
      { section: "Verificação visual / equipamento desligado", label: "Proteções de segurança (estado geral)." },
      { section: "Com equipamento ligado", label: "Pedais/joystick/comandos funcionando corretamente." },
      { section: "Com equipamento ligado", label: "Buzina e farol em funcionamento." },
      { section: "Com equipamento ligado", label: "Freio e volante operando corretamente." },
      { section: "Com equipamento ligado", label: "Retrovisores em condições gerais." },
      { section: "Com equipamento ligado", label: "Giroflex operando corretamente." },
      { section: "Com equipamento ligado", label: "Alarme de marcha ré operando corretamente." },
      { section: "Com equipamento ligado", label: "Código de erro no painel / lâmpada indicativa." },
      { section: "Com equipamento ligado", label: "Nível de combustível e indicador funcionando." },
      { section: "Com equipamento ligado", label: "Botijão GLP e manômetro funcionando." },
      { section: "Com equipamento ligado", label: "Luz de freio funcionando." },
      { section: "Com equipamento ligado", label: "Luzes de advertência no painel após partida." },
      { section: "Com equipamento ligado", label: "Direção sem folga ou barulho." },
      { section: "Com equipamento ligado", label: "Torre em funcionamento." },
      { section: "Com equipamento ligado", label: "Pedal de aproximação com deslocamento suave e frenagem correta." },
      { section: "Com equipamento ligado", label: "Engraxe geral (engraxar todos os bicos)." }
    ]
  });

  const execution = await prisma.checklistExecution.create({
    data: {
      templateId: templateEmpilhadeira.id,
      equipmentId: empilhadeira.id,
      employeeId: operadorEmpilhadeira.id,
      monthReference: "03/2026",
      operatorName: operadorEmpilhadeira.name,
      secondaryOperatorName: "Apoio Turno B",
      hourmeterValue: 451,
      mileageValue: 12240,
      fuelLevel: "1/2 tanque",
      notes: "Checklist semanal realizado no início do turno.",
      hadProblem: true
    }
  });

  const empilhadeiraItems = templateEmpilhadeira.items;
  await prisma.checklistExecutionItem.createMany({
    data: empilhadeiraItems.map((item) => ({
      executionId: execution.id,
      templateItemId: item.id,
      optionResult: item.label.includes("Código de erro no painel")
        ? ChecklistOptionResult.PROBLEMA
        : ChecklistOptionResult.OK,
      observation: item.label.includes("Código de erro no painel")
        ? "Lâmpada indicativa de advertência acesa intermitente."
        : null,
      hadProblem: item.label.includes("Código de erro no painel")
    }))
  });

  await prisma.maintenance.create({
    data: {
      equipmentId: empilhadeira.id,
      checklistExecutionId: execution.id,
      type: MaintenanceType.CORRETIVA,
      priority: MaintenancePriority.ALTA,
      status: MaintenanceStatus.ABERTA,
      description: "[Checklist] Código de erro no painel / lâmpada indicativa.",
      cause: "Advertência intermitente no painel.",
      responsibleId: manutencao.id,
      notes: "Aberta automaticamente a partir da execução do checklist."
    }
  });

  await prisma.checklistExecution.create({
    data: {
      templateId: templatePrensa01.id,
      equipmentId: prensa01.id,
      employeeId: operadorProducao.id,
      monthReference: "03/2026",
      operatorName: operadorProducao.name,
      hadProblem: false,
      notes: "Execução diária sem desvios."
    }
  });

  await prisma.maintenancePlan.createMany({
    data: [
      {
        equipmentId: empilhadeira.id,
        title: "Preventiva por horímetro - Empilhadeira GLP 01",
        description: "Troca de óleo e revisão geral a cada 250 horas.",
        triggerType: MaintenancePlanTriggerType.HOURMETER,
        threshold: 250,
        nearThreshold: 230,
        lastExecutionValue: 220,
        isActive: true
      },
      {
        equipmentId: paCarregadeira.id,
        title: "Preventiva por data - Pá Carregadeira",
        description: "Inspeção preventiva geral mensal.",
        triggerType: MaintenancePlanTriggerType.DAYS,
        threshold: 30,
        nearThreshold: 25,
        lastExecutionDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 26),
        isActive: true
      }
    ]
  });

  const epis = [
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

  for (const epi of epis) {
    await prisma.epi.upsert({
      where: { name_ca: { name: epi.name, ca: epi.ca } },
      create: { ...epi, isActive: true },
      update: { ...epi, isActive: true }
    });
  }

  const capacete = await prisma.epi.findFirstOrThrow({ where: { name: "Capacete Classe B" } });
  const oculos = await prisma.epi.findFirstOrThrow({ where: { name: "Óculos de Proteção Incolor" } });

  await prisma.epiDelivery.createMany({
    data: [
      {
        employeeId: operadorEmpilhadeira.id,
        epiId: capacete.id,
        movementType: EpiMovementType.ENTREGA,
        quantity: 1,
        date: new Date(),
        responsibleUserId: almoxarifadoUser.id,
        notes: "Entrega conforme ficha de EPI.",
        confirmationMethod: ConfirmationMethod.BIOMETRIA,
        confirmationBiometricId: "BIO-OP-1020",
        employeeSignatureName: operadorEmpilhadeira.name,
        employeeConfirmedAt: new Date()
      },
      {
        employeeId: operadorEmpilhadeira.id,
        epiId: oculos.id,
        movementType: EpiMovementType.ENTREGA,
        quantity: 1,
        date: new Date(),
        responsibleUserId: almoxarifadoUser.id,
        notes: "Entrega conforme ficha de EPI.",
        confirmationMethod: ConfirmationMethod.LOGIN,
        employeeSignatureName: operadorEmpilhadeira.name,
        employeeConfirmedAt: new Date()
      }
    ]
  });

  await prisma.employeeBiometric.upsert({
    where: { employeeId: operadorEmpilhadeira.id },
    create: {
      employeeId: operadorEmpilhadeira.id,
      biometricExternalId: "BIO-OP-1020",
      provider: BiometricProvider.UAREU_4500,
      status: BiometricStatus.CADASTRADA
    },
    update: {
      biometricExternalId: "BIO-OP-1020",
      provider: BiometricProvider.UAREU_4500,
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
