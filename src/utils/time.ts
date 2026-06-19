export const nowUtc = () => new Date();

export const toMysqlDateTime = (date: Date) =>
  date.toISOString().slice(0, 19).replace("T", " ");
