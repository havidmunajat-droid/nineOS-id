import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  auto_reply_enabled?: boolean;

  @ApiPropertyOptional({ example: 0.75 }) @IsOptional() @IsNumber() @Min(0) @Max(1)
  confidence_threshold?: number;

  @ApiPropertyOptional({ example: ['refund', 'komplain'] }) @IsOptional() @IsArray() @IsString({ each: true })
  escalation_keywords?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  fallback_message?: string;
}

export class CreateKbDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiProperty() @IsString()
  question: string;

  @ApiProperty() @IsString()
  answer: string;

  @ApiPropertyOptional({ example: ['pengiriman', 'estimasi'] }) @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}

export class UpdateKbDto extends CreateKbDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_active?: boolean;
}

export class InboundMessageDto {
  @ApiProperty({ example: 'matcha' }) @IsString()
  platform: string;

  @ApiProperty({ example: 'whatsapp' }) @IsIn(['whatsapp', 'email', 'instagram', 'tiktok'])
  channel: string;

  @ApiProperty({ example: '+6281234567890' }) @IsString()
  customer_identifier: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  customer_name?: string;

  @ApiProperty() @IsString()
  message_text: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  received_at?: string;
}

export class OutboundMessageDto {
  @ApiProperty() @IsUUID()
  conversation_id: string;

  @ApiProperty({ enum: ['ai', 'agent'] }) @IsIn(['ai', 'agent'])
  sender_type: string;

  @ApiProperty() @IsString()
  message_text: string;

  @ApiPropertyOptional({ example: 0.91 }) @IsOptional() @IsNumber() @Min(0) @Max(1)
  ai_confidence_score?: number;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  matched_kb_id?: string;
}

export class EscalateDto {
  @ApiProperty({ enum: ['low_confidence', 'keyword_match', 'manual'] })
  @IsIn(['low_confidence', 'keyword_match', 'manual'])
  reason: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1)
  ai_confidence_score?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  matched_keyword?: string;
}
