/* Datos iniciales de respaldo cuando LIA se abre sin su servidor local. */
window.LIA_CATALOG = {
  materias: [
    {
      id: "ti-administracion-2026-1",
      nombre: "Tecnologías de la Información",
      carrera: "Licenciatura en Administración",
      periodo: "2026-1",
      modo: "ampliado",
      activa: true
    }
  ],
  fuentes: [
    {
      id: "herramientas-tecnologicas-empresas",
      materiaId: "ti-administracion-2026-1",
      titulo: "Herramientas Tecnológicas Modernas para Empresas",
      tipo: "Presentación",
      unidad: "Unidad 1",
      descripcion: "Panorama de herramientas de colaboración, proyectos, nube, ERP, análisis de datos y redes sociales.",
      origen: "Material del curso",
      url: "assets/materiales/herramientas-tecnologicas-empresas.pdf",
      activa: true
    },
    {
      id: "fundamentos-inteligencia-negocios-2022",
      materiaId: "ti-administracion-2026-1",
      titulo: "Fundamentos de inteligencia de negocios",
      tipo: "Libro",
      unidad: "Unidad 2",
      descripcion: "Referencia sobre transformación digital, Big Data, analítica, almacenamiento de datos y dirección estratégica.",
      origen: "UNAM · 2022",
      url: "assets/materiales/fundamentos-inteligencia-negocios-2022.pdf",
      activa: true
    }
  ]
};
