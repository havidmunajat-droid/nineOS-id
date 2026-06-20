import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class ConnectAccountDto {
  @ApiProperty({ example: '@matcha.id' }) @IsString()
  account_handle: string;

  @ApiPropertyOptional({ example: '17841400000000000' }) @IsOptional() @IsString()
  account_id_external?: string;

  @ApiProperty({ example: 'IGQVJ...' }) @IsString()
  oauth_token: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  refresh_token?: string;

  @ApiPropertyOptional({ example: '2026-09-18T00:00:00Z' }) @IsOptional() @IsDateString()
  token_expires_at?: string;
}

export class CreateContentDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  title?: string;

  @ApiProperty({ example: 'Caption promo diskon 20%...' }) @IsString()
  caption: string;

  @ApiProperty({ example: 'image', enum: ['image', 'video', 'carousel'] })
  @IsIn(['image', 'video', 'carousel'])
  media_type: string;

  @ApiPropertyOptional({ example: ['https://cdn.matcha.app/img.jpg'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  media_urls?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  created_by?: string;
}

export class UpdateContentDto extends CreateContentDto {}

export class GenerateCaptionDto {
  @ApiProperty({ example: 'Caption promo diskon 20% matcha latte, tone santai' }) @IsString()
  prompt: string;

  @ApiProperty({ example: 'image', enum: ['image', 'video', 'carousel'] })
  @IsIn(['image', 'video', 'carousel'])
  media_type: string;
}

export class ScheduleContentDto {
  @ApiProperty({ example: ['instagram', 'tiktok'] })
  @IsArray() @IsString({ each: true })
  channels: string[];

  @ApiProperty({ example: '2026-06-22T09:00:00+07:00' }) @IsDateString()
  scheduled_at: string;

  @ApiPropertyOptional({ example: ['https://cdn.matcha.app/img.jpg'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  media_urls?: string[];
}

export class PublishResultDto {
  @ApiProperty({ example: 'posted', enum: ['posted', 'failed'] })
  @IsIn(['posted', 'failed'])
  status: string;

  @ApiPropertyOptional({ example: 'ig_5512893' }) @IsOptional() @IsString()
  external_post_id?: string;

  @ApiPropertyOptional({ example: '2026-06-22T09:00:14+07:00' }) @IsOptional() @IsDateString()
  posted_at?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  error_message?: string;
}
