'use client';

import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";

export default function PrivacyPage() {
  return (
    <Container>
      <PageHeader
        title="Política de Privacidad"
        description="Cómo protegemos tus datos en Resumidas Cuentas"
      />

      <div className="prose flex flex-col gap-4 prose-blue max-w-none mt-8">
        <h2>1. Introducción</h2>
        <p>
          En Resumidas Cuentas, nos tomamos muy en serio la protección de tus datos personales y financieros. 
          Esta Política de Privacidad explica cómo recopilamos, utilizamos, compartimos y protegemos tu información 
          cuando utilizas nuestra aplicación web.
        </p>
        <p>
          Al utilizar nuestra aplicación, aceptas las prácticas descritas en esta Política de Privacidad. 
          Si no estás de acuerdo con esta política, por favor no utilices nuestros servicios.
        </p>

        <h2>2. Información que Recopilamos</h2>
        <p>Podemos recopilar los siguientes tipos de información:</p>
        <ul>
          <li><strong>Información de registro:</strong> Cuando creas una cuenta, recopilamos tu nombre, dirección de correo electrónico y contraseña encriptada.</li>
          <li><strong>Datos financieros:</strong> Cuando cargas extractos bancarios, procesamos la información contenida en estos documentos, incluyendo transacciones, saldos y otros datos financieros.</li>
          <li><strong>Datos de uso:</strong> Información sobre cómo interactúas con nuestra aplicación, incluyendo páginas visitadas, tiempo de uso y preferencias.</li>
        </ul>

        <h2>3. Cómo Utilizamos tu Información</h2>
        <p>Utilizamos la información recopilada para:</p>
        <ul>
          <li>Proporcionar, mantener y mejorar nuestros servicios.</li>
          <li>Procesar y analizar tus datos financieros para ofrecerte insights y visualizaciones.</li>
          <li>Personalizar tu experiencia y ofrecerte contenido relevante.</li>
          <li>Comunicarnos contigo sobre actualizaciones, nuevas características o cambios en nuestros servicios.</li>
          <li>Detectar, investigar y prevenir actividades fraudulentas o no autorizadas.</li>
        </ul>

        <h2>4. Descargo de Responsabilidad sobre el Uso de IA</h2>
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 my-4">
          <h3 className="text-amber-800 font-medium">Importante: Procesamiento de Datos mediante IA</h3>
          <p className="text-amber-700">
            Resumidas Cuentas utiliza tecnologías de Inteligencia Artificial para procesar y analizar tus datos financieros. 
            En relación con este procesamiento, debes tener en cuenta que:
          </p>
          <ul className="list-disc pl-5 text-amber-700">
            <li>Los sistemas de IA pueden interpretar incorrectamente ciertos datos, lo que podría resultar en categorizaciones o análisis imprecisos.</li>
            <li>Aunque implementamos medidas de seguridad robustas, el procesamiento mediante IA implica ciertos riesgos inherentes relacionados con la precisión de los datos.</li>
            <li>Tus datos son utilizados para entrenar y mejorar nuestros modelos de IA, siempre de forma anonimizada y agregada.</li>
            <li>Puedes solicitar en cualquier momento que tus datos no sean utilizados para el entrenamiento de nuestros modelos de IA.</li>
          </ul>
          <p className="text-amber-700 font-medium mt-2">
            Al utilizar esta aplicación, aceptas que tus datos sean procesados mediante tecnologías de IA con las limitaciones mencionadas anteriormente.
          </p>
        </div>

        <h2>5. Compartición de Datos</h2>
        <p>
          No vendemos, alquilamos ni compartimos tu información personal con terceros con fines de marketing. 
          Podemos compartir tu información en las siguientes circunstancias:
        </p>
        <ul>
          <li>Con proveedores de servicios que nos ayudan a operar nuestra aplicación.</li>
          <li>Para cumplir con obligaciones legales o responder a solicitudes legales.</li>
          <li>Para proteger los derechos, la propiedad o la seguridad de Resumidas Cuentas, nuestros usuarios o el público.</li>
          <li>En caso de fusión, venta o transferencia de activos, con tu consentimiento previo.</li>
        </ul>

        <h2>6. Seguridad de los Datos</h2>
        <p>
          Implementamos medidas de seguridad técnicas, administrativas y físicas diseñadas para proteger la información 
          que recopilamos. Sin embargo, ningún sistema es completamente seguro, y no podemos garantizar la seguridad 
          absoluta de tu información.
        </p>

        <h2>7. Tus Derechos</h2>
        <p>Dependiendo de tu ubicación, puedes tener los siguientes derechos:</p>
        <ul>
          <li>Acceder a tu información personal.</li>
          <li>Corregir datos inexactos o incompletos.</li>
          <li>Eliminar tu información personal.</li>
          <li>Oponerte al procesamiento de tus datos.</li>
          <li>Solicitar la portabilidad de tus datos.</li>
          <li>Retirar tu consentimiento en cualquier momento.</li>
        </ul>
        <p>
          Para ejercer estos derechos, por favor contáctanos a través de los medios proporcionados en la sección &quot;Contacto&quot;.
        </p>

        <h2>8. Retención de Datos</h2>
        <p>
          Conservamos tu información personal mientras mantengas una cuenta activa o según sea necesario para 
          proporcionarte servicios. Podemos retener cierta información para cumplir con nuestras obligaciones 
          legales, resolver disputas y hacer cumplir nuestros acuerdos.
        </p>

        <h2>9. Cambios a esta Política</h2>
        <p>
          Podemos actualizar esta Política de Privacidad periódicamente. Te notificaremos sobre cambios significativos 
          publicando la nueva política en nuestra aplicación o enviándote una notificación.
        </p>

        <h2>10. Contacto</h2>
        <p>
          Si tienes preguntas o inquietudes sobre esta Política de Privacidad, por favor contáctanos en 
          privacy@resumidascuentas.com.
        </p>

        <p className="text-sm text-gray-500 mt-8">
          Última actualización: {new Date().toLocaleDateString('es-ES')}
        </p>
      </div>
    </Container>
  );
} 