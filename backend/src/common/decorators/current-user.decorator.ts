import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Pulls the JWT-decoded user injected by JwtStrategy onto request.user
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
