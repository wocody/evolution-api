import { RouterBroker } from '@api/abstract/abstract.router';
import { SendNewsletterTextDto } from '@api/dto/newsletter.dto';
import { HttpStatus } from '@api/types/http-status';
import { newsletterTextMessageSchema } from '@validate/newsletter.schema';
import { RequestHandler, Router } from 'express';

type NewsletterControllerContract = {
  sendText(instance: { instanceName: string }, data: SendNewsletterTextDto): Promise<unknown>;
};

export class NewsletterRouter extends RouterBroker {
  constructor(newsletterController: NewsletterControllerContract, ...guards: RequestHandler[]) {
    super();

    this.router.post(this.routerPath('sendText'), ...guards, async (req, res) => {
      const response = await this.dataValidate<SendNewsletterTextDto>({
        request: req,
        schema: newsletterTextMessageSchema,
        ClassRef: SendNewsletterTextDto,
        execute: (instance, data) => newsletterController.sendText(instance, data),
      });

      return res.status(HttpStatus.CREATED).json(response);
    });
  }

  public readonly router: Router = Router();
}
