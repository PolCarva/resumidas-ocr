'use client';

import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";

export default function TermsPage() {
  return (
    <main className="page-shell pb-10">
      <Container>
      <PageHeader
        title="Términos de Servicio"
        description="Condiciones de uso de Resumidas Cuentas"
      />

      <div className="legal-prose">
        <h2>1. Introducción</h2>
        <p>
          Bienvenido a Resumidas Cuentas. Estos Términos de Servicio rigen tu uso de nuestra aplicación web, 
          incluyendo cualquier característica, funcionalidad y contenido disponible a través de nuestro sitio.
        </p>
        <p>
          Al acceder o utilizar nuestra aplicación, aceptas estar sujeto a estos Términos. Si no estás de acuerdo 
          con alguna parte de estos términos, no podrás acceder a la aplicación.
        </p>

        <h2>2. Descripción del Servicio</h2>
        <p>
          Resumidas Cuentas es una herramienta de análisis financiero personal que te permite cargar, analizar y 
          categorizar tus extractos bancarios para obtener una mejor comprensión de tus finanzas personales.
        </p>

        <h2>3. Descargo de Responsabilidad sobre el Uso de IA</h2>
        <div className="legal-highlight">
          <h3 className="font-medium text-amber-900">Importante: Uso de Inteligencia Artificial</h3>
          <p className="text-amber-800">
            Resumidas Cuentas utiliza tecnologías de Inteligencia Artificial para analizar y categorizar tus datos financieros. 
            A pesar de nuestros esfuerzos por garantizar la precisión, debes tener en cuenta que:
          </p>
          <ul className="list-disc pl-5 text-amber-800">
            <li>Los sistemas de IA pueden interpretar incorrectamente ciertos datos o transacciones.</li>
            <li>Las categorizaciones y análisis generados son aproximaciones y pueden contener errores.</li>
            <li>La información proporcionada no constituye asesoramiento financiero profesional.</li>
            <li>Siempre debes verificar manualmente los resultados importantes antes de tomar decisiones financieras.</li>
          </ul>
          <p className="mt-2 font-medium text-amber-900">
            Al utilizar esta aplicación, aceptas que la información generada por IA es solo una herramienta de apoyo 
            y no reemplaza el criterio humano o el asesoramiento financiero profesional.
          </p>
        </div>

        <h2>4. Registro de Cuenta</h2>
        <p>
          Para acceder a ciertas funciones de nuestra aplicación, deberás registrarte y crear una cuenta. 
          Eres responsable de mantener la confidencialidad de tu información de cuenta y contraseña.
        </p>

        <h2>5. Privacidad y Datos del Usuario</h2>
        <p>
          Tu privacidad es importante para nosotros. Nuestra Política de Privacidad describe cómo recopilamos, 
          utilizamos y protegemos tus datos personales y financieros.
        </p>

        <h2>6. Propiedad Intelectual</h2>
        <p>
          Todos los derechos de propiedad intelectual relacionados con la aplicación y su contenido son propiedad 
          de Resumidas Cuentas o sus licenciantes. Estos materiales están protegidos por leyes de propiedad intelectual.
        </p>

        <h2>7. Limitación de Responsabilidad</h2>
        <p>
          En ningún caso Resumidas Cuentas será responsable por daños indirectos, incidentales, especiales, 
          consecuentes o punitivos, incluyendo pérdida de beneficios, datos o uso.
        </p>
        <p>
          Nuestra responsabilidad total ante ti por cualquier reclamación derivada de estos Términos no excederá 
          la cantidad que hayas pagado a Resumidas Cuentas en los 12 meses anteriores a dicha reclamación.
        </p>

        <h2>8. Modificaciones</h2>
        <p>
          Nos reservamos el derecho de modificar estos Términos en cualquier momento. Las modificaciones entrarán 
          en vigor inmediatamente después de su publicación. Tu uso continuado de la aplicación después de cualquier 
          cambio constituye tu aceptación de los nuevos Términos.
        </p>

        <h2>9. Ley Aplicable</h2>
        <p>
          Estos Términos se regirán e interpretarán de acuerdo con las leyes de Uruguay, sin tener en cuenta 
          sus disposiciones sobre conflictos de leyes.
        </p>

        <h2>10. Contacto</h2>
        <p>
          Si tienes alguna pregunta sobre estos Términos, por favor contáctanos a través de nuestro formulario 
          de contacto o enviando un correo electrónico a info@resumidascuentas.com.
        </p>

        <p className="mt-8 text-sm text-slate-500">
          Última actualización: {new Date().toLocaleDateString('es-ES')}
        </p>
      </div>
      </Container>
    </main>
  );
} 
