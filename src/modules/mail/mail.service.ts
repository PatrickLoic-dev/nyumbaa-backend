import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly from: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('resend.apiKey'));
    this.from = this.config.get<string>('resend.fromEmail') ?? 'noreply@nyumbaa.app';
  }

  async sendWelcome(to: string, displayName: string, lang: string = 'fr') {
    const subjects: Record<string, string> = {
      fr: `Bienvenue sur Nyumba'a, ${displayName} !`,
      en: `Welcome to Nyumba'a, ${displayName}!`,
      es: `¡Bienvenido a Nyumba'a, ${displayName}!`,
    };

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: subjects[lang] ?? subjects['fr'],
      html: `<p>Bienvenue ${displayName}</p>`,
    });
  }

  async sendPasswordReset(to: string, resetLink: string) {
    await this.resend.emails.send({
      from: this.from,
      to,
      subject: "Réinitialisation de votre mot de passe Nyumba'a",
      html: `<p>Cliquez ici pour réinitialiser votre mot de passe : <a href="${resetLink}">${resetLink}</a></p><p>Ce lien expire dans 1 heure.</p>`,
    });
  }
}
