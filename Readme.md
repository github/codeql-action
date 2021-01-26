Acción CodeQL
Esta acción ejecuta el motor de análisis estático líder en la industria de GitHub, CodeQL, contra el código fuente de un repositorio para encontrar vulnerabilidades de seguridad. Luego, carga automáticamente los resultados a GitHub para que se puedan mostrar en la pestaña de seguridad del repositorio. CodeQL ejecuta un conjunto extensible de consultas , que han sido desarrolladas por la comunidad y el laboratorio de seguridad de GitHub para encontrar vulnerabilidades comunes en su código.

Licencia
Este proyecto se publica bajo la licencia MIT .

La CLI de CodeQL subyacente, utilizada en esta acción, está autorizada según los Términos y condiciones de CodeQL de GitHub . Como tal, esta acción se puede usar en proyectos de código abierto alojados en GitHub y en repositorios privados que son propiedad de una organización con GitHub Advanced Security habilitado.

Uso
Este es un breve tutorial, pero para obtener más información, lea cómo configurar el escaneo de código .

Para obtener resultados de escaneo de código del análisis de CodeQL en su repositorio, puede usar el siguiente flujo de trabajo como plantilla:

nombre : " Escaneo de código - Acción "

on :
   push :
   pull_request :
   schedule :
     #         ┌───────────── minuto (0 - 59) 
    #         │ ┌────────────── hora (0 - 23 ) 
    #         │ │ ┌───────────── día del mes (1 - 31) 
    #         │ │ │ ┌────────────── mes (1 - 12 o ENE-DIC) 
    #         │ │ │ │ ┌───────────── día de la semana (0 - 6 o DOM-SÁB) 
    #         │ │ │ │ │ 
    #         │ │ │ │ │ 
    #         │ │ │ │ │ 
    #         * * * * * 
    - cron : ' 30 1 * * 0 '

trabajos :
   CodeQL-Build :
     # CodeQL se ejecuta en ubuntu-latest, windows-latest y macos-latest se 
    ejecuta en : ubuntu-latest

    pasos :
      - nombre : el repositorio de Checkout 
        usa : actions / checkout @ v2

      # Inicializa las herramientas CodeQL para escanear. 
      - nombre : Initialize CodeQL 
        uses : github / codeql-action / init @ v1 
        # Anula la selección de idioma descomentando esto y eligiendo tus idiomas 
        # con: 
        #    languages: go, javascript, csharp, python, cpp, java

      # Autobuild intenta construir cualquier lenguaje compilado (C / C ++, C # o Java). 
      # Si este paso falla, entonces debe eliminarlo y ejecutar la compilación manualmente (ver más abajo). 
      - nombre : Autobuild 
        usa : github / codeql-action / autobuild @ v1

      # ℹ️ Programas de línea de comandos para ejecutar usando el shell del sistema operativo. 
      # 📚 https://git.io/JvXDl

      # ✏️ Si el Autobuild falla arriba, elimínelo y descomente las siguientes 
      #     tres líneas y modifíquelas (o agregue más) para construir su código si su 
      #     proyecto usa un lenguaje compilado

      # - ejecutar: | 
      #    hacer bootstrap 
      #    hacer lanzamiento

      - nombre : Realizar análisis de CodeQL 
        utiliza : github / codeql-action / analyse @ v1
Si prefiere integrar esto dentro de un flujo de trabajo de CI existente, debería terminar pareciéndose a esto:

- nombre : Initialize CodeQL 
  usa : github / codeql-action / init @ v1 
  con :
     languages : go, javascript

# Aquí es donde construyes tu código 
- ejecuta : | 
  hacer bootstrap 
  hacer lanzamiento

- nombre : Realizar análisis de CodeQL 
  utiliza : github / codeql-action / analyse @ v1
Archivo de configuración
Utilice el config-fileparámetro de la initacción para habilitar el archivo de configuración. El valor de config-filees la ruta al archivo de configuración que desea utilizar. Este ejemplo carga el archivo de configuración ./.github/codeql/codeql-config.yml.

- utiliza : github / codeql-action / init @ v1 
  con :
     config-file : ./.github/codeql/codeql-config.yml
El archivo de configuración se puede ubicar en un repositorio diferente. Esto es útil si desea compartir la misma configuración en varios repositorios. Si el archivo de configuración está en un repositorio privado, también puede especificar una external-repository-tokenopción. Debe ser un token de acceso personal que tenga acceso de lectura a cualquier repositorio que contenga consultas y archivos de configuración referenciados.

- usa : github / codeql-action / init @ v1 
  con :
     config-file : owner/repo/codeql-config.yml@branch 
    external-repository-token : $ {{secrets.EXTERNAL_REPOSITORY_TOKEN}}
Para obtener información sobre cómo escribir un archivo de configuración, consulte " Uso de un archivo de configuración personalizado ".

Si solo desea personalizar las consultas utilizadas, puede especificarlas en su flujo de trabajo en lugar de crear un archivo de configuración, utilizando la queriespropiedad de la initacción:

- usa : github / codeql-action / init @ v1 
  con :
     consultas : <local-or-remote-query>, <otra-query>
De forma predeterminada, esto anulará cualquier consulta especificada en un archivo de configuración. Si desea utilizar ambos conjuntos de consultas, anteponga la lista de consultas en el flujo de trabajo con +:

- utiliza : github / codeql-action / init @ v1 
  con :
     consultas : + <local-or-remote-query>, <otra-query>
Solución de problemas
Lea acerca de la resolución de problemas de escaneo de códigos .
