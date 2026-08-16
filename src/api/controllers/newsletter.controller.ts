import { InstanceDto } from '@api/dto/instance.dto';
import { SendNewsletterTextDto } from '@api/dto/newsletter.dto';
import { NewsletterService } from '@api/services/newsletter.service';

export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  public async sendText({ instanceName }: InstanceDto, data: SendNewsletterTextDto) {
    return this.newsletterService.sendText(instanceName, data);
  }
}
