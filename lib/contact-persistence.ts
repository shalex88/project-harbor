export const AUTHORIZED_CONTACT_PROJECT_SQL = `
  SELECT contact.project_id
  FROM project_contacts contact
  JOIN project_members member ON member.project_id = contact.project_id
  WHERE contact.id = ? AND member.user_id = ?
`;

export const CONTACT_INSERT_SQL = `
  INSERT INTO project_contacts
  (id,project_id,name,role_or_company,email,phone,notes)
  VALUES (?,?,?,?,?,?,?)
`;

export const CONTACT_UPDATE_SQL = `
  UPDATE project_contacts SET name=?,role_or_company=?,email=?,phone=?,
  notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?
`;

export const CONTACT_DELETE_SQL =
  "DELETE FROM project_contacts WHERE id = ?";

export async function findAuthorizedContactProject(
  database: D1Database,
  userId: string,
  contactId: string,
): Promise<string | null> {
  const row = await database
    .prepare(AUTHORIZED_CONTACT_PROJECT_SQL)
    .bind(contactId, userId)
    .first<{ project_id: string }>();
  return row?.project_id ?? null;
}
