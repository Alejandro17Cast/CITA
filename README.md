CITA
Sistema de gestión de citas y reservaciones

Plataforma web para centralizar la administración de clientes, espacios, reservaciones y operaciones administrativas.
<p align="left">
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 6" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
</p>Índice
- Descripción
- Objetivos
- Funcionalidades
- Tecnologías
- Arquitectura
- Estructura del proyecto
- Requisitos
- Instalación
- Configuración
- Base de datos
- Comandos disponibles
- Seguridad
- Autoría
Descripción
CITA es una aplicación web diseñada para apoyar la gestión administrativa de organizaciones que requieren administrar espacios y coordinar reservaciones. Su propósito es centralizar los procesos operativos y facilitar el acceso a información relevante desde una plataforma unificada.

El sistema integra módulos para administrar clientes, espacios, reservaciones, calendario, pagos, finanzas, usuarios y reportes. La aplicación está desarrollada con React y TypeScript, mientras que Supabase proporciona los servicios backend y PostgreSQL funciona como sistema gestor de base de datos relacional.
Objetivos
- Centralizar la información operativa en una sola plataforma.
- Facilitar el registro y seguimiento de clientes y reservaciones.
- Organizar la administración de espacios.
- Mantener un control de pagos y operaciones relacionadas.
- Proporcionar información para el seguimiento administrativo y la toma de decisiones.
Funcionalidades
Módulo	Descripción
Autenticación	Inicio de sesión y acceso al sistema.
Panel principal	Consulta de indicadores e información general de la operación.
Clientes	Registro, consulta y administración de clientes.
Espacios	Administración de los espacios disponibles.
Reservaciones	Registro y seguimiento de reservaciones.
Calendario	Visualización de reservaciones por fecha.
Pagos	Registro y consulta de pagos asociados a las reservaciones.
Finanzas	Consulta de información y movimientos financieros.
Reportes	Generación y exportación de reportes administrativos.
Usuarios	Administración de cuentas y perfiles de acceso.
Mantenimientos	Registro y seguimiento de actividades de mantenimiento.


El acceso a las operaciones y a la información depende de los roles y permisos configurados en la aplicación.
Tecnologías
Frontend
Tecnología	Aplicación
React 19	Construcción de interfaces mediante componentes.
TypeScript 6	Tipado estático y mantenibilidad del código.
Vite 8	Entorno de desarrollo y herramienta de compilación.
CSS	Estilos y presentación de la interfaz.


Backend y persistencia
Tecnología	Aplicación
Supabase	Servicios backend y comunicación con la base de datos.
PostgreSQL	Gestión de datos relacionales.
Supabase Auth	Autenticación de usuarios.
Supabase Edge Functions	Ejecución de operaciones específicas del lado del servidor.
SQL / PL/pgSQL	Definición de estructuras y lógica de base de datos.


Bibliotecas complementarias
- ExcelJS: generación y manipulación de archivos Excel.
- jsPDF: generación de documentos PDF.
- jsPDF-AutoTable: generación de tablas en documentos PDF.
- Oxlint: análisis estático del código.
Arquitectura
CITA utiliza una arquitectura cliente-servidor. La aplicación desarrollada en React constituye la capa de presentación y se comunica con los servicios de Supabase. PostgreSQL proporciona el almacenamiento persistente de la información.
┌──────────────────────────────┐
│            Usuario           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     Aplicación web           │
│     React + TypeScript       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Cliente Supabase       │
└────────┬─────────────┬───────┘
         │             │
         ▼             ▼
┌──────────────┐  ┌────────────────┐
│ Supabase Auth│  │ Edge Functions │
└──────────────┘  └────────────────┘
         │
         ▼
┌──────────────────────────────┐
│          PostgreSQL          │
└──────────────────────────────┘
El repositorio incluye una Edge Function para la invitación de usuarios y migraciones SQL que documentan la creación y evolución de componentes de la base de datos.
Estructura del proyecto
CITA/
├── public/                     # Recursos públicos
├── src/
│   ├── assets/                 # Recursos gráficos
│   ├── lib/
│   │   └── supabase.ts         # Cliente de Supabase
│   ├── pages/                  # Vistas y módulos del sistema
│   ├── App.tsx                 # Componente principal
│   ├── App.css                 # Estilos de la aplicación
│   ├── index.css               # Estilos globales
│   └── main.tsx                # Punto de entrada
├── supabase/
│   ├── functions/
│   │   └── invitar-usuario/    # Función de invitación
│   └── migration/              # Migraciones SQL
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
Vistas principales
Las páginas principales se encuentran en src/pages/:
- LoginPage.tsx
- DashboardPage.tsx
- ClientesPage.tsx
- EspaciosPage.tsx
- ReservacionesPage.tsx
- GestionReservacionesPage.tsx
- CalendarioPage.tsx
- PagosPage.tsx
- FinanzasPanel.tsx
- ReportesPage.tsx
- UsuariosPage.tsx
- MantenimientosPage.tsx
Requisitos
Antes de instalar el proyecto, asegúrate de contar con:
- Node.js en una versión compatible con Vite 8.
- npm, incluido con Node.js.
- Un proyecto configurado en Supabase.
Comprueba las versiones instaladas:
node --version
npm --version
Instalación
1. Clonar el repositorio
git clone https://github.com/Alejandro17Cast/CITA.git
cd CITA
2. Instalar dependencias
npm install
3. Configurar las variables de entorno
Crea un archivo .env.local en la raíz del proyecto:
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA
Sustituye los valores de ejemplo por la URL y la clave pública de tu proyecto de Supabase.
4. Ejecutar en desarrollo
npm run dev
Vite mostrará en la terminal la dirección local para acceder a la aplicación.
5. Compilar para producción
npm run build
Los archivos optimizados se generarán en el directorio dist/.

Para previsualizar la compilación:
npm run preview
Configuración
La conexión con Supabase se encuentra centralizada en:
src/lib/supabase.ts
Verifica que las variables de entorno estén definidas correctamente antes de iniciar la aplicación. Si modificas .env.local, reinicia el servidor de desarrollo para que los cambios sean reconocidos.
Base de datos
Las migraciones SQL se encuentran en supabase/migration/ y deben revisarse y ejecutarse en el orden establecido.

El repositorio incluye scripts relacionados con:
1. Creación de perfiles.
2. Creación de clientes.
3. Creación de espacios.
4. Gestión de reservaciones.
5. Registro de pagos.
6. Cancelación de reservaciones.
7. Gestión de reembolsos.
8. Entrega de reembolsos.
Al configurar una nueva instancia, verifica las dependencias entre migraciones, funciones, permisos y políticas de seguridad necesarias para el funcionamiento del sistema.
Comandos disponibles
Comando	Descripción
npm run dev	Inicia el servidor de desarrollo.
npm run build	Verifica TypeScript y compila la aplicación.
npm run preview	Previsualiza la compilación de producción.
npm run lint	Ejecuta el análisis estático con Oxlint.


Seguridad
- No incluyas archivos .env.local ni credenciales en el repositorio.
- No expongas contraseñas de PostgreSQL, claves service_role ni tokens privados en el frontend.
- Las variables con prefijo VITE_ se incorporan al código del cliente; no deben contener secretos.
- Configura políticas de Row Level Security (RLS) en las tablas expuestas mediante Supabase.
- Verifica los permisos asociados a cada rol.
- Ejecuta las operaciones sensibles mediante mecanismos seguros del lado del servidor.
- Evita publicar información personal o financiera real.

Ingeniería de Sistemas · Desarrollo de software
<div align="center">CITA
Gestión organizada. Información centralizada. Procesos eficientes.

Repositorio en GitHub
</div>