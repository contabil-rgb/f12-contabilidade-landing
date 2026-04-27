import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderCheck,
  Handshake,
  LineChart,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';

const navLinks = [
  { label: 'Serviços', href: '#servicos' },
  { label: 'Sobre', href: '#sobre' },
  { label: 'Diferenciais', href: '#diferenciais' },
  { label: 'Contato', href: '#contato' },
];

const whatsappMessage =
  'Olá, vim pelo site da F12 Contabilidade e gostaria de solicitar atendimento.';
const whatsappUrl = `https://wa.me/5592984123021?text=${encodeURIComponent(whatsappMessage)}`;

const benefits = [
  { icon: Handshake, label: 'Atendimento consultivo' },
  { icon: BarChart3, label: 'Relatórios claros' },
  { icon: LineChart, label: 'Apoio na tomada de decisão' },
  { icon: ShieldCheck, label: 'Gestão contábil e fiscal segura' },
];

const services = [
  {
    icon: Building2,
    title: 'Contabilidade empresarial',
    description:
      'Rotinas contábeis estruturadas para manter sua empresa organizada e pronta para crescer.',
  },
  {
    icon: Handshake,
    title: 'Consultoria contábil',
    description:
      'Orientação próxima para transformar dados contábeis em decisões práticas de gestão.',
  },
  {
    icon: Calculator,
    title: 'Planejamento tributário',
    description:
      'Análise do enquadramento fiscal e caminhos para uma carga tributária mais eficiente.',
  },
  {
    icon: ReceiptText,
    title: 'Gestão fiscal',
    description:
      'Acompanhamento das obrigações, apurações e prazos fiscais com segurança e clareza.',
  },
  {
    icon: Users,
    title: 'Folha de pagamento',
    description:
      'Processos trabalhistas, encargos e admissões conduzidos com precisão e responsabilidade.',
  },
  {
    icon: FileText,
    title: 'Relatórios gerenciais',
    description:
      'Indicadores simples de ler para acompanhar resultados, custos, caixa e desempenho.',
  },
];

const differentials = [
  { icon: CheckCircle2, title: 'Linguagem simples' },
  { icon: TrendingUp, title: 'Análise de indicadores' },
  { icon: CalendarDays, title: 'Acompanhamento mensal' },
  { icon: FolderCheck, title: 'Organização de documentos' },
  { icon: BadgeCheck, title: 'Apoio em decisões estratégicas' },
  { icon: ClipboardCheck, title: 'Atendimento próximo' },
];

const metrics = [
  { label: 'Receita bruta', value: 'R$ 1.250.000', delta: '+12,5%' },
  { label: 'Lucro líquido', value: 'R$ 215.600', delta: '+8,7%' },
  { label: 'Tributos previstos', value: 'R$ 98.750', delta: '100%' },
];

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
        <a href="#" className="flex items-center gap-3" aria-label="F12 Contabilidade">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-950 text-lg font-black text-white shadow-soft">
            F12
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-extrabold text-navy-950">F12</span>
            <span className="block text-xs font-semibold uppercase text-slate-500">
              Contabilidade
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-700 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition hover:text-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Fale com um especialista da F12 Contabilidade pelo WhatsApp"
          className="hidden rounded-lg bg-brand-blue px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-navy-700 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand-blue/25 sm:inline-flex"
        >
          Fale com um especialista
        </a>
      </div>
    </header>
  );
}

function HeroDashboard() {
  return (
    <aside
      className="float-panel relative mx-auto w-full max-w-xl rounded-lg border border-white/20 bg-white p-3 shadow-panel"
      aria-label="Ilustração de painel financeiro"
    >
      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-slate-50 lg:grid-cols-[132px_1fr]">
        <div className="hidden bg-navy-950 p-5 text-white lg:block">
          <p className="text-2xl font-black">F12</p>
          <div className="mt-7 space-y-3 text-xs font-semibold text-slate-300">
            {['Visão geral', 'Financeiro', 'Fiscal', 'Relatórios'].map((item, index) => (
              <div
                key={item}
                className={`rounded-lg px-3 py-2 ${index === 0 ? 'bg-brand-blue text-white' : 'bg-white/5'}`}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold text-brand-blue">Visão financeira</p>
              <h2 className="text-xl font-extrabold text-navy-950">Painel gerencial</h2>
              <p className="text-xs text-slate-500">Atualizado em tempo real para gestão.</p>
            </div>
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              Abril / 2026
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">{metric.label}</p>
                <p className="mt-2 text-lg font-black text-navy-950">{metric.value}</p>
                <p className="mt-1 text-xs font-bold text-emerald-600">{metric.delta} vs. mês anterior</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-navy-950">Receita x despesa</p>
                <span className="text-xs font-semibold text-slate-500">6 meses</span>
              </div>
              <svg viewBox="0 0 360 170" className="mt-3 h-40 w-full" role="img" aria-label="Gráfico de linhas">
                <g stroke="#e2e8f0" strokeWidth="1">
                  <line x1="24" y1="30" x2="340" y2="30" />
                  <line x1="24" y1="70" x2="340" y2="70" />
                  <line x1="24" y1="110" x2="340" y2="110" />
                  <line x1="24" y1="150" x2="340" y2="150" />
                </g>
                <polyline
                  className="dashboard-line"
                  fill="none"
                  points="26,124 82,108 138,92 194,100 250,72 318,52"
                  stroke="#0b66ff"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <polyline
                  fill="none"
                  points="26,136 82,130 138,116 194,122 250,98 318,76"
                  stroke="#16c7bd"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                {[26, 82, 138, 194, 250, 318].map((x, index) => (
                  <circle key={x} cx={x} cy={[124, 108, 92, 100, 72, 52][index]} r="4" fill="#0b66ff" />
                ))}
              </svg>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-navy-950">Fluxo de caixa</p>
              <div className="mt-5 flex h-36 items-end gap-2">
                {[46, 68, 94, 58, 112, 78].map((height, index) => (
                  <span
                    key={height}
                    className={`w-full rounded-t-md ${index % 2 === 0 ? 'bg-brand-blue' : 'bg-brand-teal'}`}
                    style={{ height }}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-brand-blue" />
                  Receita
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-brand-teal" />
                  Caixa
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function BenefitBar() {
  return (
    <section aria-label="Benefícios" className="relative z-20 -mt-8 px-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3 rounded-lg p-3 transition hover:bg-slate-50">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-sky text-brand-blue">
              <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <p className="text-sm font-bold text-navy-950">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({ label, title, description }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-extrabold text-brand-blue">{label}</p>
      <h2 className="mt-3 text-3xl font-black text-navy-950 sm:text-4xl">{title}</h2>
      {description ? <p className="mt-4 text-lg leading-8 text-slate-600">{description}</p> : null}
    </div>
  );
}

function Services() {
  return (
    <section id="servicos" className="bg-slate-50 px-5 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          label="Serviços"
          title="Soluções contábeis para empresas que precisam de previsibilidade"
          description="Cuidamos da rotina contábil, fiscal e gerencial com informações úteis para o dia a dia da gestão."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {services.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="group rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-brand-blue/30 hover:shadow-soft"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy-950 text-white transition group-hover:bg-brand-blue">
                <Icon size={23} aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-xl font-black text-navy-950">{title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="sobre" className="bg-white px-5 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="text-sm font-extrabold text-brand-blue">Sobre a F12</p>
          <h2 className="mt-3 text-3xl font-black text-navy-950 sm:text-4xl">
            Contabilidade com visão prática para apoiar a gestão
          </h2>
          <p className="mt-6 text-lg leading-9 text-slate-600">
            A F12 Contabilidade atua com uma visão prática e consultiva, indo além do cumprimento
            de obrigações. Nosso objetivo é transformar informações contábeis em dados úteis para
            gestão, controle financeiro e crescimento sustentável.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['Controle', 'Processos contábeis e fiscais acompanhados com método.'],
            ['Clareza', 'Relatórios objetivos para entender resultados e prioridades.'],
            ['Segurança', 'Prazos, obrigações e indicadores tratados com consistência.'],
            ['Crescimento', 'Dados organizados para decisões mais conscientes.'],
          ].map(([title, description]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <p className="text-2xl font-black text-brand-blue">{title}</p>
              <p className="mt-3 leading-7 text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Differentials() {
  return (
    <section id="diferenciais" className="bg-slate-50 px-5 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          label="Diferenciais"
          title="Uma rotina contábil mais próxima, clara e orientada a decisões"
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {differentials.map(({ icon: Icon, title }) => (
            <div
              key={title}
              className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-teal/40 hover:shadow-soft"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-brand-teal">
                <Icon size={22} aria-hidden="true" />
              </span>
              <h3 className="text-lg font-black text-navy-950">{title}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="bg-white px-5 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-lg bg-navy-950 px-6 py-14 text-white shadow-panel sm:px-10 lg:px-14">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm font-extrabold text-brand-teal">Atendimento consultivo</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">
              Quer entender melhor os números da sua empresa?
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-200">
              Entre em contato com a F12 Contabilidade e veja como podemos ajudar sua empresa a ter
              mais controle e segurança.
            </p>
          </div>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Solicitar atendimento da F12 Contabilidade pelo WhatsApp"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-teal px-6 py-4 text-base font-black text-navy-950 shadow-soft transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-brand-teal/30"
          >
            Solicitar atendimento
            <ArrowRight size={19} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contato" className="bg-navy-950 px-5 py-14 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_1fr_0.7fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-lg font-black text-navy-950">
              F12
            </span>
            <div>
              <p className="text-xl font-black">F12 Contabilidade</p>
              <p className="text-sm text-slate-300">Contabilidade consultiva e gestão empresarial</p>
            </div>
          </div>
        </div>

        <address className="not-italic text-sm leading-7 text-slate-300">
          <p className="flex gap-3">
            <Phone className="mt-1 shrink-0 text-brand-teal" size={18} aria-hidden="true" />
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-white"
            >
              WhatsApp: (92) 98412-3021
            </a>
          </p>
          <p className="mt-3 flex gap-3">
            <Mail className="mt-1 shrink-0 text-brand-teal" size={18} aria-hidden="true" />
            <span>Email: comercial@f12contabilidade.com.br</span>
          </p>
          <p className="mt-3 flex gap-3">
            <MapPin className="mt-1 shrink-0 text-brand-teal" size={18} aria-hidden="true" />
            <span>R. Rio Mar, 185 - Nossa Sra. das Graças, Manaus - AM, 69053-180</span>
          </p>
        </address>

        <nav aria-label="Links do rodapé" className="flex flex-col gap-3 text-sm font-semibold text-slate-300">
          <a className="transition hover:text-white" href="#servicos">
            Serviços
          </a>
          <a className="transition hover:text-white" href="#sobre">
            Sobre
          </a>
          <a className="transition hover:text-white" href="#contato">
            Contato
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main>
        <section className="hero-lines overflow-hidden bg-navy-950 px-5 pb-28 pt-16 text-white sm:px-6 sm:pt-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="reveal-up max-w-3xl">
              <p className="text-sm font-extrabold text-brand-teal">
                Contabilidade consultiva para empresas
              </p>
              <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
                Contabilidade consultiva para empresas que precisam de clareza, controle e segurança
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200 sm:text-xl">
                A F12 Contabilidade ajuda empresas a organizar seus números, acompanhar resultados e
                tomar decisões com mais confiança.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Fale com um especialista da F12 Contabilidade pelo WhatsApp"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-6 py-4 text-base font-black text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-brand-teal hover:text-navy-950 focus:outline-none focus:ring-4 focus:ring-brand-blue/30"
                >
                  Fale com um especialista
                  <ArrowRight size={19} aria-hidden="true" />
                </a>
                <a
                  href="#servicos"
                  className="inline-flex items-center justify-center rounded-lg border border-white/35 px-6 py-4 text-base font-black text-white transition hover:-translate-y-0.5 hover:border-white hover:bg-white hover:text-navy-950 focus:outline-none focus:ring-4 focus:ring-white/20"
                >
                  Conheça nossos serviços
                </a>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  ['+ Clareza', 'Indicadores fáceis de acompanhar'],
                  ['+ Controle', 'Rotina fiscal e contábil organizada'],
                  ['+ Segurança', 'Prazos e obrigações monitorados'],
                ].map(([title, text]) => (
                  <div key={title} className="border-l border-white/20 pl-4">
                    <p className="font-black text-white">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <HeroDashboard />
          </div>
        </section>

        <BenefitBar />
        <Services />
        <About />
        <Differentials />
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}
