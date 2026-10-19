import { DateTime } from 'luxon'
import type { PasswordResetModel, PasswordResetStore } from '../types.js'

export class LucidPasswordResetStore implements PasswordResetStore {
  constructor(private model: PasswordResetModel) {}

  async create(record: Parameters<PasswordResetStore['create']>[0]) {
    await this.model.updateOrCreate(
      { email: record.email },
      { token: record.token, createdAt: DateTime.fromJSDate(record.createdAt) }
    )
  }

  async hasRecent(email: string, since: Date) {
    return Boolean(
      await this.model
        .query()
        .where('email', email)
        .where('createdAt', '>', DateTime.fromJSDate(since))
        .first()
    )
  }

  async consume(email: string, token: string) {
    const deleted = await this.model
      .query()
      .where('email', email)
      .where('token', token)
      .delete()
    return deleted > 0
  }
}
