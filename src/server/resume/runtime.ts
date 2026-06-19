import { getAppServices } from "../app-services";

export function getResumeRuntime() {
  const services = getAppServices();
  return {
    repository: services.resumeRepository,
    service: services.resumeService,
  };
}
