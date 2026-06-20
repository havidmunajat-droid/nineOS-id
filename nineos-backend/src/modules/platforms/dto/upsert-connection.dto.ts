import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CredentialsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  api_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  oauth_client_secret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  oauth_access_token?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  oauth_refresh_token?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhook_secret?: string;
}

export class UpsertConnectionDto {
  @ApiProperty({ example: 'staging', enum: ['staging', 'production'] })
  @IsIn(['staging', 'production'])
  environment: 'staging' | 'production';

  @ApiProperty({ example: 'https://api.matcha.internal' })
  @IsUrl({ require_tld: false })
  base_url: string;

  @ApiProperty({ example: 'api_key', enum: ['api_key', 'oauth2', 'basic'] })
  @IsIn(['api_key', 'oauth2', 'basic'])
  auth_type: 'api_key' | 'oauth2' | 'basic';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  oauth_client_id?: string;

  @ApiProperty()
  @IsNotEmpty()
  credentials: CredentialsDto;
}
